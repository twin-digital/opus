import { isBrowser } from './is-browser.js'

interface Utterance {
  kill: () => boolean
}

let current: Utterance | undefined

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
        const child = exec(`say ${JSON.stringify(text)}`, () => {
          if (current === child) {
            current = undefined
          }
          resolve()
        })
        current = child
      }),
  )
}
