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
 *
 * PROBE_BACKEND selects the audio plumbing: 'webaudio' (default — node-web-audio-api, whose output runs on cpal) or
 * 'rtaudio' (audify's RtAudio bindings — an independent CoreAudio path sharing no code with cpal). If the rtaudio
 * backend survives where webaudio dies, the fault is in cpal's layer and RtAudio is a viable escape hatch; if both
 * die alike, the fault is below every library.
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

/** Interleaved stereo float32, matching RTAUDIO_FLOAT32 = 0x10 (audify declares it as a const enum, unusable as a runtime import). */
const Float32Format = 0x10

const FrameSize = 512

interface RtDevice {
  id: number
  name: string
  outputChannels: number
  preferredSampleRate: number
  sampleRates: number[]
}

interface RtStream {
  closeStream: () => void
  getDefaultOutputDevice: () => number
  getDevices: () => RtDevice[]
  openStream: (
    output: { deviceId: number; firstChannel: number; nChannels: number } | null,
    input: null,
    format: number,
    sampleRate: number,
    frameSize: number,
    name: string,
    inputCallback: null,
    frameOutputCallback: null,
    flags?: number,
    errorCallback?: (type: number, message: string) => void,
  ) => number
  start: () => void
  streamTime: number
  write: (pcm: Buffer) => void
}

interface RtProbe {
  beepRemaining: number
  lastStreamTime: number
  lastWall: number
  name: string
  phase: number
  pitch: number
  rate: number
  rt: RtStream
  written: number
}

const openRtProbe = async (name: string, pitch: number, startedAt: number): Promise<RtProbe | undefined> => {
  try {
    // audify is CJS re-exporting a native binding, so its named exports are invisible to the ESM lexer and live on
    // `default`.
    // audify is an optional peer dependency: the default install does not carry it, so the native binding only
    // downloads for users who ask for this backend and supply the package alongside.
    interface AudifyModule {
      default?: { RtAudio: new () => RtStream }
      RtAudio?: new () => RtStream
    }
    let imported: AudifyModule
    try {
      imported = await import('audify')
    } catch (error) {
      console.log(
        `[${name}] PROBE_BACKEND=rtaudio needs the optional 'audify' package (${String(error)}). Run:\n` +
          `  npx -y -p @thrashplay/music@latest -p audify music-audio-probe`,
      )
      return undefined
    }
    const RtAudio = (imported.default ?? imported).RtAudio
    if (RtAudio === undefined) {
      console.log(`[${name}] FAILED TO OPEN: audify loaded but exposes no RtAudio`)
      return undefined
    }
    const rt = new RtAudio()

    const devices = rt.getDevices()
    const defaultId = rt.getDefaultOutputDevice()
    const device = devices.find((candidate) => candidate.id === defaultId)
    if (device === undefined) {
      console.log(`[${name}] FAILED TO OPEN: no output device (rtaudio saw ${devices.length} devices)`)
      return undefined
    }

    const requested = Number(process.env.PROBE_SAMPLE_RATE ?? '')
    const rate = Number.isFinite(requested) && requested > 0 ? requested : device.preferredSampleRate
    console.log(
      `[${name}] rtaudio device: name=${JSON.stringify(device.name)} preferred=${device.preferredSampleRate} ` +
        `supported=[${device.sampleRates.join(', ')}] opening at ${rate}`,
    )

    rt.openStream(
      { deviceId: device.id, firstChannel: 0, nChannels: 2 },
      null,
      Float32Format,
      rate,
      FrameSize,
      name,
      null,
      null,
      0,
      (type, message) => {
        console.log(`[${name}] rtaudio error callback: type=${type} ${message}`)
      },
    )
    rt.start()

    return {
      beepRemaining: 0,
      lastStreamTime: rt.streamTime,
      lastWall: startedAt,
      name,
      phase: 0,
      pitch,
      rate,
      rt,
      written: 0,
    }
  } catch (error) {
    console.log(`[${name}] FAILED TO OPEN: ${String(error)}`)
    return undefined
  }
}

/**
 * Pushes PCM ahead of the stream: sine while a beep is pending, silence otherwise, always ~200 ms ahead of wall time
 * so scheduling jitter never starves the device.
 */
const pumpRtProbe = (probe: RtProbe, startedAt: number) => {
  const targetSamples = ((Date.now() - startedAt) / 1000 + 0.2) * probe.rate

  while (probe.written < targetSamples) {
    const frame = new Float32Array(FrameSize * 2)
    for (let i = 0; i < FrameSize; i++) {
      if (probe.beepRemaining > 0) {
        const sample = Math.sin(probe.phase) * 0.2
        frame[i * 2] = sample
        frame[i * 2 + 1] = sample
        probe.phase += (2 * Math.PI * probe.pitch) / probe.rate
        probe.beepRemaining--
      }
    }

    probe.rt.write(Buffer.from(frame.buffer))
    probe.written += FrameSize
  }
}

const reportRtProbe = (probe: RtProbe, startedAt: number) => {
  const now = Date.now()
  const streamTime = probe.rt.streamTime
  const wallDelta = (now - probe.lastWall) / 1000
  const ratio = wallDelta > 0 ? (streamTime - probe.lastStreamTime) / wallDelta : 1
  probe.lastWall = now
  probe.lastStreamTime = streamTime

  console.log(
    `[${probe.name}] t+${((now - startedAt) / 1000).toFixed(0)}s streamTime=${streamTime.toFixed(1)}s ` +
      `rate=${ratio.toFixed(3)} written=${(probe.written / probe.rate).toFixed(1)}s (beeping at ${probe.pitch}Hz)`,
  )
}

const runRtAudio = async () => {
  console.log('Backend: rtaudio (audify) — an independent CoreAudio path sharing no code with cpal.')

  const startedAt = Date.now()
  const first = await openRtProbe('rt-probe-1', 440, startedAt)
  if (first === undefined) {
    process.exitCode = 1
    return
  }

  let second: RtProbe | undefined
  const probes = () => [first, ...(second === undefined ? [] : [second])]

  const pump = setInterval(() => {
    probes().forEach((probe) => {
      pumpRtProbe(probe, startedAt)
    })
  }, 25)

  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt

      if (second === undefined && elapsed >= SecondContextAtMs) {
        void openRtProbe('rt-probe-2', 880, startedAt).then((probe) => {
          second = probe
        })
      }

      probes().forEach((probe) => {
        probe.beepRemaining = Math.floor(probe.rate * 0.15)
        reportRtProbe(probe, startedAt)
      })

      if (elapsed >= EndAtMs) {
        clearInterval(timer)
        clearInterval(pump)
        resolve()
      }
    }, HealthIntervalMs)
  })

  console.log('Probe complete.')
  probes().forEach(({ rt }) => {
    try {
      rt.closeStream()
    } catch {
      // the stream may already be dead; the probe has what it came for either way
    }
  })
  process.exit(0)
}

const main = async () => {
  if (process.env.PROBE_BACKEND === 'rtaudio') {
    console.log('Audio probe: listen for the beeps — a stream is dead when its pitch goes silent.')
    await runRtAudio()
    return
  }

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
