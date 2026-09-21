import { describe, expect, it, vi } from 'vitest'

import type { Cell } from '../ui/drawable.js'
import type { RgbColor } from '../ui/color.js'
import type { StudioService, StudioState, Take } from './studio-service.js'
import { TransportPads, createTransportOverlay } from './transport-overlay.js'

const take: Take = { id: '1', name: 'Take 1', start: 0, end: 10, duration: 10 }

const makeService = (state: Partial<StudioState> = {}) => {
  const service = {
    getState: (): StudioState => ({
      connected: true,
      transport: 'stopped',
      recordingElapsed: 0,
      level: 0,
      takes: [take],
      playingTake: undefined,
      instruments: undefined,
      projectName: undefined,
      ...state,
    }),
    toggleRecord: vi.fn(() => Promise.resolve()),
    togglePlayLatest: vi.fn(() => Promise.resolve()),
  }
  return service as unknown as StudioService & typeof service
}

const cellAt = (cells: Cell<RgbColor>[], { x, y }: { x: number; y: number }) =>
  cells.find((c) => c.x === x && c.y === y)

const press = (cell: Cell<RgbColor> | undefined) => {
  cell?.onPress?.({ type: 'press', x: 0, y: 0, absoluteX: cell.x, absoluteY: cell.y })
}

describe('createTransportOverlay', () => {
  it('draws only the two transport pads in the top row', () => {
    const cells = createTransportOverlay(makeService()).getDrawable().draw()
    expect(cells.map(({ x, y }) => ({ x, y }))).toEqual(
      expect.arrayContaining([TransportPads.record, TransportPads.play]),
    )
    expect(cells).toHaveLength(2)
  })

  it('routes presses to the service toggles', () => {
    const service = makeService()
    const cells = createTransportOverlay(service).getDrawable().draw()

    press(cellAt(cells, TransportPads.record))
    press(cellAt(cells, TransportPads.play))

    expect(service.toggleRecord).toHaveBeenCalledOnce()
    expect(service.togglePlayLatest).toHaveBeenCalledOnce()
  })

  it('idles dim, pulses while active, and goes dark when disconnected', () => {
    const idle = createTransportOverlay(makeService()).getDrawable().draw()
    expect(cellAt(idle, TransportPads.record)?.value).toEqual([40, 0, 0])
    expect(cellAt(idle, TransportPads.play)?.value).toEqual([36, 36, 36])

    const recording = createTransportOverlay(makeService({ transport: 'recording' }))
    recording.update?.(0.25) // top of the pulse
    const [r, g, b] = cellAt(recording.getDrawable().draw(), TransportPads.record)?.value ?? [0, 0, 0]
    expect(r).toBeGreaterThan(100)
    expect(g).toBe(0)
    expect(b).toBe(0)

    const playing = createTransportOverlay(makeService({ transport: 'playing' }))
      .getDrawable()
      .draw()
    const [pr, pg] = cellAt(playing, TransportPads.play)?.value ?? [0, 0]
    expect(pr).toBe(0)
    expect(pg).toBeGreaterThan(0)

    const offline = createTransportOverlay(makeService({ connected: false }))
      .getDrawable()
      .draw()
    expect(cellAt(offline, TransportPads.record)?.value).toEqual([0, 0, 0])
    expect(cellAt(offline, TransportPads.play)?.value).toEqual([0, 0, 0])
  })

  it('hides the play pad until there is a take to play', () => {
    const cells = createTransportOverlay(makeService({ takes: [] }))
      .getDrawable()
      .draw()
    expect(cellAt(cells, TransportPads.play)?.value).toEqual([0, 0, 0])
    expect(cellAt(cells, TransportPads.record)?.value).toEqual([40, 0, 0])
  })
})
