import { isBrowser } from '../app/is-browser.js'

/**
 * Specifier held in a variable, and marked `@vite-ignore`, so Vite cannot statically analyze it. The sim never
 * evaluates this branch, but a literal specifier would pull the native addon into the browser bundle graph.
 */
const NodeWebAudioModule = 'node-web-audio-api'

let context: Promise<AudioContext> | undefined

/**
 * Resolves the process-wide AudioContext, creating it on first use: the browser's native implementation, or the
 * Rust-backed `node-web-audio-api` under Node. Both implement the Web Audio API, so callers are platform-agnostic.
 */
export const getAudioContext = (): Promise<AudioContext> => {
  context ??=
    isBrowser() ?
      Promise.resolve(new window.AudioContext())
    : import(/* @vite-ignore */ NodeWebAudioModule).then(
        (nodeWebAudio: { AudioContext: new () => unknown }) => new nodeWebAudio.AudioContext() as AudioContext,
      )

  return context
}
