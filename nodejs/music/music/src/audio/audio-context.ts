import { isBrowser } from '../app/is-browser.js'

/**
 * Specifier held in a variable, and marked `@vite-ignore`, so Vite cannot statically analyze it. The sim never
 * evaluates this branch, but a literal specifier would pull the native addon into the browser bundle graph.
 */
const NodeWebAudioModule = 'node-web-audio-api'

/**
 * The Web Audio constructors this package uses. The browser's globals and `node-web-audio-api` both provide them.
 */
export interface AudioApi {
  AudioContext: new (options?: { sampleRate?: number }) => AudioContext
  OfflineAudioContext: new (channels: number, length: number, sampleRate: number) => OfflineAudioContext
}

let api: Promise<AudioApi> | undefined

/**
 * Resolves the Web Audio implementation, loading it on first use: the browser's, or the Rust-backed
 * `node-web-audio-api` under Node.
 *
 * This hands back the constructors rather than a context, because constructing an `AudioContext` claims the machine's
 * audio output device — so when that happens is the caller's decision. `SamplePlayer` decodes against a device-less
 * `OfflineAudioContext` and only opens an output once a sample is actually played.
 */
export const getAudioApi = (): Promise<AudioApi> => {
  api ??=
    isBrowser() ?
      Promise.resolve(window as unknown as AudioApi)
    : import(/* @vite-ignore */ NodeWebAudioModule).then((nodeWebAudio: AudioApi) => nodeWebAudio)

  return api
}
