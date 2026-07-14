import { logger } from '../logger.js'
import { normalizeMidiByte } from '../midi/normalize-midi-byte.js'
import { getAudioContext } from './audio-context.js'
import { readSample } from './sample-store.js'

const log = logger.child({}, { msgPrefix: '[AUDIO] ' })

/**
 * Whoever started a sample sounding — a `Channel`, typically. Used only as an identity, to scope {@link
 * SamplePlayer.stopAll} to one owner's voices.
 */
export type SampleOwner = object

/**
 * Plays one-shot samples through the Web Audio API. Decoding is memoized per sample name and kept off the playback
 * path entirely, so pressing a key does no I/O.
 */
export class SamplePlayer {
  private _buffers = new Map<string, AudioBuffer>()

  private _context: AudioContext | undefined

  /**
   * Resolution of the audio context, memoized so that a machine with no usable audio output reports it once rather
   * than once per sample.
   */
  private _contextLoad: Promise<AudioContext | undefined> | undefined

  /**
   * In-flight and completed decodes, keyed by sample name. Memoized so overlapping `load` calls — the eager warm-up
   * at startup and the load triggered by selecting a board — share one decode rather than racing.
   */
  private _decodes = new Map<string, Promise<void>>()

  /**
   * Sources currently sounding, grouped by whoever started them, so that one voice's owner can be silenced without
   * cutting off another's. A single player is shared across channels, and stopping "this channel" must not stop the
   * rest.
   */
  private _voices = new Map<SampleOwner, Set<AudioBufferSourceNode>>()

  /**
   * Reads and decodes the named samples, skipping any already decoded or in flight. A sample that cannot be loaded is
   * logged and skipped, leaving the rest of the board playable; the promise resolves either way.
   */
  public load(names: readonly string[]): Promise<void> {
    return Promise.all(names.map((name) => this.decode(name))).then(() => undefined)
  }

  private context(): Promise<AudioContext | undefined> {
    this._contextLoad ??= getAudioContext().then(
      (context) => {
        this._context = context
        return context
      },
      (error: unknown) => {
        log.warn(`No audio output is available, so sound boards will be silent. [error=${String(error)}]`)
        return undefined
      },
    )

    return this._contextLoad
  }

  private decode(name: string): Promise<void> {
    let decode = this._decodes.get(name)
    if (decode === undefined) {
      decode = this.read(name)
      this._decodes.set(name, decode)
    }

    return decode
  }

  private async read(name: string): Promise<void> {
    const context = await this.context()
    if (context === undefined) {
      return
    }

    let encoded: ArrayBuffer
    try {
      encoded = await readSample(name)
    } catch (error) {
      log.warn(
        `Sample is not on disk. Run 'music-fetch-samples' to download the sound-board samples. [sample=${name}, error=${String(error)}]`,
      )
      return
    }

    try {
      this._buffers.set(name, await context.decodeAudioData(encoded))
    } catch (error) {
      log.warn(`Unable to decode sample. [sample=${name}, error=${String(error)}]`)
    }
  }

  /**
   * Sounds a sample immediately, at a gain taken from the note's velocity.
   *
   * This never waits on a decode. A sample that is not yet in memory is dropped and its decode started, because a
   * sound arriving whenever I/O happens to finish — potentially after the key is released — is worse than silence.
   * Callers warm the cache ahead of time (see {@link load}), so a miss should not happen in practice.
   * @param name Sample to sound.
   * @param velocity Velocity of the note that triggered it, which becomes the gain.
   * @param owner Who is playing it, so {@link stopAll} can silence this voice without touching anyone else's.
   */
  public play(name: string, velocity: number, owner: SampleOwner) {
    const buffer = this._buffers.get(name)
    if (this._context === undefined || buffer === undefined) {
      void this.decode(name)
      return
    }

    // A browser context starts suspended until a user gesture; the keypress that got us here is that gesture.
    if (this._context.state === 'suspended') {
      void this._context.resume()
    }

    const source = this._context.createBufferSource()
    source.buffer = buffer

    const gain = this._context.createGain()
    gain.gain.value = normalizeMidiByte(velocity) / 127

    source.connect(gain)
    gain.connect(this._context.destination)

    const voices = this._voices.get(owner) ?? new Set<AudioBufferSourceNode>()
    this._voices.set(owner, voices)

    source.onended = () => {
      voices.delete(source)
      source.disconnect()
      gain.disconnect()
    }

    voices.add(source)
    source.start()
  }

  /**
   * Silences samples currently sounding: one owner's, or every one of them if no owner is named.
   * @param owner Whose voices to silence. Omit to silence all of them.
   */
  public stopAll(owner?: SampleOwner) {
    const groups = owner === undefined ? [...this._voices.values()] : [this._voices.get(owner)]

    groups.forEach((voices) => {
      voices?.forEach((voice) => {
        voice.stop()
      })
      voices?.clear()
    })
  }
}
