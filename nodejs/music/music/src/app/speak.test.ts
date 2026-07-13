import { beforeEach, describe, expect, it, vi } from 'vitest'

import { speak } from './speak.js'

interface FakeChild {
  kill: ReturnType<typeof vi.fn>
  finish: () => void
}

const children: FakeChild[] = []

vi.mock('node:child_process', () => ({
  exec: vi.fn((_command: string, callback?: () => void) => {
    const child: FakeChild = {
      kill: vi.fn(() => {
        // a killed `say` process exits, which fires exec's callback
        child.finish()
        return true
      }),
      finish: () => {
        callback?.()
      },
    }
    children.push(child)
    return child
  }),
}))

describe('speak', () => {
  beforeEach(() => {
    children.length = 0
  })

  it('resolves when the utterance finishes', async () => {
    const done = vi.fn()
    const promise = speak('hello').then(done)
    await vi.waitFor(() => {
      expect(children).toHaveLength(1)
    })
    expect(done).not.toHaveBeenCalled()

    children[0].finish()
    await promise
    expect(done).toHaveBeenCalled()
  })

  it('kills the in-flight utterance when a new one starts', async () => {
    const first = speak('first')
    await vi.waitFor(() => {
      expect(children).toHaveLength(1)
    })

    const second = speak('second')
    await vi.waitFor(() => {
      expect(children).toHaveLength(2)
    })

    // starting the second utterance supersedes (kills) the first, whose promise still resolves
    expect(children[0].kill).toHaveBeenCalled()
    await first

    children[1].finish()
    await second
    expect(children[1].kill).not.toHaveBeenCalled()
  })
})
