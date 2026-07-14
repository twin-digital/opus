#!/usr/bin/env node

import { AudioContext } from 'node-web-audio-api'

/**
 * Standalone probe for the ~90-second audio death on macOS (twin-digital/opus#254): opens an output stream, beeps
 * through it every five seconds, and prints the stream's vitals, so the failure can be heard and measured at once
 * with no MIDI hardware or samples involved. A second stream opens at 100 seconds and alternates beeps with the
 * first, answering whether a fresh stream survives the first one's death — which decides whether stream recycling
 * can work around the failure or the whole audio session is poisoned.
 *
 * Beep pitches identify the stream: low (440 Hz) is the first, high (880 Hz) is the second.
 */

/**
 * Stream configuration overrides, for isolating a sample-rate or buffering mismatch with the device: PROBE_SAMPLE_RATE
 * opens the stream at an explicit rate instead of the library's choice, and PROBE_LATENCY takes 'interactive',
 * 'balanced', 'playback', or a number of seconds. The failing stream's zombie clock runs at almost exactly
 * 44100/48000, so whichever explicit rate survives names the mismatch.
 */
const contextOptions = () => {
  const options: { latencyHint?: number | string; sampleRate?: number } = {}
  const rate = Number(process.env.PROBE_SAMPLE_RATE ?? '')
  if (Number.isFinite(rate) && rate > 0) {
    options.sampleRate = rate
  }

  const latency = process.env.PROBE_LATENCY
  if (latency !== undefined && latency !== '') {
    options.latencyHint = ['interactive', 'balanced', 'playback'].includes(latency) ? latency : Number(latency)
  }

  return options
}

const HealthIntervalMs = 5_000
const SecondContextAtMs = 100_000
const EndAtMs = 240_000

interface Probe {
  context: AudioContext
  lastClock: number
  lastWall: number
  name: string
  pitch: number
}

const beep = (probe: Probe) => {
  const { context, pitch } = probe
  const length = Math.floor(context.sampleRate * 0.15)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const fade = Math.min(1, (length - i) / (length * 0.3))
    samples[i] = Math.sin((2 * Math.PI * pitch * i) / context.sampleRate) * 0.2 * fade
  }

  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
}

const openProbe = (name: string, pitch: number): Probe | undefined => {
  const options = contextOptions()
  console.log(`[${name}] opening with requested=${JSON.stringify(options)}`)

  try {
    const context = new AudioContext(options as ConstructorParameters<typeof AudioContext>[0])
    console.log(
      `[${name}] opened: sampleRate=${context.sampleRate} baseLatency=${context.baseLatency.toFixed(4)} state=${context.state}`,
    )

    const capacity = (context as Partial<{ renderCapacity: EventTarget & { start: (o: object) => void } }>)
      .renderCapacity
    capacity?.addEventListener('update', (event) => {
      const { averageLoad, peakLoad, underrunRatio } = event as unknown as {
        averageLoad: number
        peakLoad: number
        underrunRatio: number
      }
      if (underrunRatio > 0 || peakLoad > 0.5) {
        console.log(
          `[${name}] capacity: avg=${averageLoad.toFixed(3)} peak=${peakLoad.toFixed(3)} underruns=${underrunRatio.toFixed(3)}`,
        )
      }
    })
    capacity?.start({ updateInterval: 1 })

    return { context, lastClock: context.currentTime, lastWall: Date.now(), name, pitch }
  } catch (error) {
    console.log(`[${name}] FAILED TO OPEN: ${String(error)}`)
    return undefined
  }
}

const report = (probe: Probe, startedAt: number) => {
  const now = Date.now()
  const clock = probe.context.currentTime
  const wallDelta = (now - probe.lastWall) / 1000
  const clockDelta = clock - probe.lastClock
  const ratio = wallDelta > 0 ? clockDelta / wallDelta : 1
  probe.lastWall = now
  probe.lastClock = clock

  console.log(
    `[${probe.name}] t+${((now - startedAt) / 1000).toFixed(0)}s clock=${clock.toFixed(1)}s ` +
      `rate=${ratio.toFixed(3)} state=${probe.context.state} (beeping at ${probe.pitch}Hz)`,
  )
}

const main = async () => {
  console.log('Audio probe: listen for the beeps — a stream is dead when its pitch goes silent.')
  console.log(
    `Probe 1 (440 Hz) starts now; probe 2 (880 Hz) joins at t+${SecondContextAtMs / 1000}s; ends at t+${EndAtMs / 1000}s.`,
  )

  const startedAt = Date.now()
  const first = openProbe('probe-1', 440)
  if (first === undefined) {
    process.exitCode = 1
    return
  }

  let second: Probe | undefined
  const probes = () => [first, ...(second === undefined ? [] : [second])]

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt

      if (second === undefined && elapsed >= SecondContextAtMs) {
        second = openProbe('probe-2', 880)
      }

      probes().forEach((probe) => {
        beep(probe)
        report(probe, startedAt)
      })

      if (elapsed >= EndAtMs) {
        clearInterval(timer)
        resolve()
      }
    }, HealthIntervalMs)
  })

  console.log('Probe complete.')
  await Promise.all(probes().map(({ context }) => context.close().catch(() => undefined)))
  process.exit(0)
}

await main()
