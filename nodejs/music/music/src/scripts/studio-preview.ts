#!/usr/bin/env node

import { Events } from '../typed-event-emitter.js'
import { createStudioServer } from '../studio/studio-server.js'
import { ReaperClient } from '../studio/reaper-client.js'
import { StudioService } from '../studio/studio-service.js'
import { getConfig } from '../config.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { bundledHelperHash } from '../studio/helper.js'
import {
  parseTakeName,
  sanitizeLabel,
  type StudioApi,
  type StudioEventMap,
  type StudioState,
  type Take,
} from '../studio/studio-service.js'
import type { InstrumentSelection } from '../app/sound-picker/sound-picker-program.js'

/**
 * Runs the studio touch page without the Launchpad or the piano. With MUSIC_REAPER_URL set it drives that REAPER for
 * real (transport, clips, renames); otherwise it runs against a simulated studio, so the page can be looked at and
 * poked with nothing else running: takes accumulate as you record, playback runs for the take's length, the level bar
 * wobbles, and the instrument name cycles. MUSIC_STUDIO_PORT picks the port (default 8765); MUSIC_STUDIO_HOST the
 * bind address (default 127.0.0.1, use 0.0.0.0 to reach it from another device).
 */

const instruments: InstrumentSelection[] = [
  { split: false, instrument: 'Acoustic Grand Piano' },
  { split: false, instrument: 'Church Organ' },
  { split: true, left: 'Standard Kit', right: 'Electric Piano 1' },
  { split: false, instrument: 'Minecraft Note Block' },
]

const makeFakeStudio = (): StudioApi => {
  const events = new Events<StudioEventMap>()
  let takeCount = 2
  let recordingStartedAt: number | undefined
  let playingUntil: number | undefined
  let state: StudioState = {
    connected: true,
    transport: 'stopped',
    recordingElapsed: 0,
    level: 0,
    meters: [],
    position: 0,
    takes: [
      {
        id: '2',
        name: 'Clip 2 - Sep 21, 03:12 PM',
        ...parseTakeName('Clip 2 - Sep 21, 03:12 PM'),
        start: 32,
        end: 41.5,
        duration: 9.5,
      },
      { id: '1', name: 'Clip 1 - Twinkle', ...parseTakeName('Clip 1 - Twinkle'), start: 0, end: 30, duration: 30 },
    ],
    playingTake: undefined,
    instruments: instruments[0],
    projectName: 'Piano Corner 2026',
    helper: { version: 'preview', hash: 'preview', matches: true },
  }

  const update = (patch: Partial<StudioState>) => {
    state = { ...state, ...patch }
    events.emit('change', state)
  }

  const stop = () => {
    if (state.transport === 'recording' && recordingStartedAt !== undefined) {
      const duration = (Date.now() - recordingStartedAt) / 1000
      const start = (state.takes[0]?.end ?? -2) + 2
      takeCount += 1
      const name = `Clip ${String(takeCount)} - ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      const take: Take = {
        id: String(takeCount),
        name,
        ...parseTakeName(name),
        start,
        end: start + duration,
        duration,
      }
      update({ transport: 'stopped', recordingElapsed: 0, level: 0, meters: [], takes: [take, ...state.takes] })
    } else {
      update({ transport: 'stopped', level: 0, meters: [], position: 0, playingTake: undefined })
    }
    recordingStartedAt = undefined
    playingUntil = undefined
  }

  let playingFrom = 0
  const play = (take: Take, at = 0) => {
    playingFrom = Date.now() - at * 1000
    playingUntil = playingFrom + take.duration * 1000
    update({ transport: 'playing', playingTake: take, position: at })
  }

  const wobble = (base: number) => Math.min(1, Math.max(0, base + (Math.random() - 0.5) * 0.3))
  const meters = (piano: number, vocal: number) => [
    { name: 'Piano', level: wobble(piano) },
    { name: 'Samples', level: wobble(piano * 0.4) },
    { name: 'Vocal', level: wobble(vocal) },
    { name: 'Master', level: wobble(Math.max(piano, vocal)) },
  ]

  setInterval(() => {
    if (state.transport === 'recording' && recordingStartedAt !== undefined) {
      const t = (Date.now() - recordingStartedAt) / 1000
      const piano = 0.35 + 0.35 * Math.abs(Math.sin(t * 1.3))
      update({ recordingElapsed: t, level: wobble(piano), meters: meters(piano, 0.25) })
    } else if (state.transport === 'playing') {
      if (playingUntil !== undefined && Date.now() >= playingUntil) {
        stop()
      } else {
        const t = (Date.now() - playingFrom) / 1000
        const piano = 0.3 + 0.4 * Math.abs(Math.sin(t * 1.1))
        update({ position: t, level: wobble(piano), meters: meters(piano, 0.5) })
      }
    }
  }, 50)

  let instrumentIndex = 0
  setInterval(() => {
    instrumentIndex = (instrumentIndex + 1) % instruments.length
    update({ instruments: instruments[instrumentIndex] })
  }, 6000)

  const studio: StudioApi = {
    events,
    getState: () => state,
    record: () => {
      recordingStartedAt = Date.now()
      update({ transport: 'recording', playingTake: undefined, recordingElapsed: 0 })
      return Promise.resolve()
    },
    stopTransport: () => {
      stop()
      return Promise.resolve()
    },
    playLatest: () => {
      const latest = state.takes.at(0)
      if (latest !== undefined) {
        play(latest)
      }
      return Promise.resolve()
    },
    playTake: (id, atSeconds) => {
      const take = state.takes.find((candidate) => candidate.id === id)
      if (take !== undefined) {
        play(take, atSeconds)
      }
      return Promise.resolve()
    },
    toggleRecord: () => (state.transport === 'recording' ? studio.stopTransport() : studio.record()),
    togglePlayLatest: () => (state.transport === 'playing' ? studio.stopTransport() : studio.playLatest()),
    renameTake: (id, label) => {
      const clean = sanitizeLabel(label)
      // the real watcher takes a poll or two; mimic that
      setTimeout(() => {
        update({
          takes: state.takes.map((take) => {
            if (take.id !== id || clean === '') {
              return take
            }
            const name = `Clip ${String(take.number ?? 0)} - ${clean}`
            return { ...take, name, ...parseTakeName(name) }
          }),
        })
      }, 400)
      return Promise.resolve()
    },
    seekTake: (id, atSeconds) => {
      const take = state.takes.find((candidate) => candidate.id === id)
      if (take !== undefined) {
        play(take, atSeconds)
      }
      return Promise.resolve()
    },
    reloadHelper: () => Promise.resolve(),
    setInstruments: (selection) => {
      update({ instruments: selection })
    },
  }
  return studio
}

const makeRealStudio = async (baseUrl: string): Promise<StudioApi> => {
  const studio = new StudioService({
    client: new ReaperClient({ baseUrl }),
    expectedHelperHash: await bundledHelperHash(),
  })
  studio.start()
  studio.setInstruments({ split: false, instrument: 'Acoustic Grand Piano' })
  console.log(`Driving REAPER at ${baseUrl}`)
  return studio
}

/** A short synthetic recording (a few decaying notes), so the waveform has something to draw. */
const syntheticClip = async (seconds: number): Promise<string> => {
  const rate = 22050
  const frames = Math.floor(seconds * rate)
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++) {
    const t = i / rate
    const note = Math.floor(t / 0.8)
    const phase = t - note * 0.8
    const freq = 220 * 2 ** (((note * 5) % 12) / 12)
    const env = Math.exp(-phase * 2.5)
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.8
    data.writeInt16LE(Math.round(sample * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'studio-preview-')), 'clip.wav')
  await fs.writeFile(file, Buffer.concat([header, data]))
  return file
}

const { reaperUrl } = getConfig()
const fake = reaperUrl === undefined
const clip = fake ? await syntheticClip(30) : undefined
const server = await createStudioServer({
  service: fake ? makeFakeStudio() : await makeRealStudio(reaperUrl),
  clipFile: fake ? () => Promise.resolve(clip) : undefined,
  port: Number(process.env.MUSIC_STUDIO_PORT ?? '8765'),
  host: process.env.MUSIC_STUDIO_HOST ?? '127.0.0.1',
})
console.log(`Studio page preview: ${server.url}`)
