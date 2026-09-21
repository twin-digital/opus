#!/usr/bin/env node

import { Events } from '../typed-event-emitter.js'
import { createStudioServer } from '../studio/studio-server.js'
import { ReaperClient } from '../studio/reaper-client.js'
import { StudioService } from '../studio/studio-service.js'
import { getConfig } from '../config.js'
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
      update({ transport: 'stopped', recordingElapsed: 0, level: 0, takes: [take, ...state.takes] })
    } else {
      update({ transport: 'stopped', level: 0, playingTake: undefined })
    }
    recordingStartedAt = undefined
    playingUntil = undefined
  }

  const play = (take: Take) => {
    playingUntil = Date.now() + take.duration * 1000
    update({ transport: 'playing', playingTake: take })
  }

  setInterval(() => {
    if (state.transport === 'recording' && recordingStartedAt !== undefined) {
      update({ recordingElapsed: (Date.now() - recordingStartedAt) / 1000, level: 0.3 + 0.5 * Math.random() })
    } else if (state.transport === 'playing') {
      if (playingUntil !== undefined && Date.now() >= playingUntil) {
        stop()
      } else {
        update({ level: 0.2 + 0.6 * Math.random() })
      }
    }
  }, 150)

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
    playTake: (id) => {
      const take = state.takes.find((candidate) => candidate.id === id)
      if (take !== undefined) {
        play(take)
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

const { reaperUrl } = getConfig()
const server = await createStudioServer({
  service: reaperUrl === undefined ? makeFakeStudio() : await makeRealStudio(reaperUrl),
  port: Number(process.env.MUSIC_STUDIO_PORT ?? '8765'),
  host: process.env.MUSIC_STUDIO_HOST ?? '127.0.0.1',
})
console.log(`Studio page preview: ${server.url}`)
