import { isBrowser } from './is-browser.js'

interface Utterance {
  kill: () => boolean
}

let current: Utterance | undefined

/**
 * Volume utterances are spoken at, 0-1. Read from MUSIC_SPEECH_VOLUME; the default sits well under full, because
 * speech shares an output with the sampled instruments and the piano, and announcements should not drown them out.
 */
const speechVolume = () => {
  const configured = Number(process.env.MUSIC_SPEECH_VOLUME ?? '0.5')
  return Number.isFinite(configured) ? Math.min(1, Math.max(0, configured)) : 0.5
}

/**
 * Speaks text aloud (macOS `say`). A new utterance supersedes any still in flight — the
 * previous `say` process is killed so announcements never talk over each other. The returned
 * promise resolves when the utterance finishes (including when it is superseded or the spawn
 * fails); it never rejects, so callers can sequence audio after it unconditionally.
 */
export const speak = (text: string): Promise<void> => {
  if (isBrowser()) {
    console.warn(`Unable to 'speak' text from browser: ${text}`)
    return Promise.resolve()
  }

  return import('node:child_process').then(
    ({ exec }) =>
      new Promise<void>((resolve) => {
        current?.kill()
        // [[volm N]] is `say`'s inline volume directive, scoped to this utterance.
        const child = exec(`say ${JSON.stringify(`[[volm ${speechVolume()}]] ${text}`)}`, () => {
          if (current === child) {
            current = undefined
          }
          resolve()
        })
        current = child
      }),
  )
}
