import { describe, expect, it } from 'vitest'

import { advanceTicks, createServer, InvalidArgumentError, NotImplementedError } from './index.js'

/** The error a call threw, so a case can assert on its class and its fields. */
const thrownBy = (call: () => unknown): unknown => {
  try {
    call()
  } catch (error) {
    return error
  }
  throw new Error('expected the call to throw, and it did not')
}

describe('currentTick', () => {
  it('starts at 0', () => {
    expect(createServer().system.currentTick).toBe(0)
  })

  it('moves only under advanceTicks', async () => {
    const server = createServer()
    let calls = 0
    const count = (): void => {
      calls += 1
    }
    server.system.run(count)
    server.system.runTimeout(count, 1)
    server.system.runInterval(count, 1)
    await Promise.resolve()
    expect(server.system.currentTick).toBe(0)
    expect(calls).toBe(0)
  })

  it('advances by exactly the count given', () => {
    const server = createServer()
    advanceTicks(server, 7)
    expect(server.system.currentTick).toBe(7)
    advanceTicks(server, 3)
    expect(server.system.currentTick).toBe(10)
  })

  it('runs nothing and moves nothing for a count of 0', () => {
    const server = createServer()
    let calls = 0
    server.system.run(() => {
      calls += 1
    })
    advanceTicks(server, 0)
    expect(server.system.currentTick).toBe(0)
    expect(calls).toBe(0)
  })

  it('rejects a negative or fractional count and leaves currentTick unmoved', () => {
    const server = createServer()
    advanceTicks(server, 2)
    expect(
      thrownBy(() => {
        advanceTicks(server, -1)
      }),
    ).toBeInstanceOf(InvalidArgumentError)
    expect(
      thrownBy(() => {
        advanceTicks(server, 1.5)
      }),
    ).toBeInstanceOf(InvalidArgumentError)
    expect(server.system.currentTick).toBe(2)
  })
})

describe('run', () => {
  it('returns a distinct numeric handle per call', () => {
    const { system } = createServer()
    const noop = (): void => undefined
    const handles = [system.run(noop), system.run(noop), system.runTimeout(noop, 2), system.runInterval(noop, 2)]
    for (const handle of handles) {
      expect(typeof handle).toBe('number')
    }
    expect(new Set(handles).size).toBe(4)
  })

  it('fires on the next tick', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.run(() => {
      ticks.push(server.system.currentTick)
    })
    advanceTicks(server, 1)
    expect(ticks).toEqual([1])
  })

  it('fires exactly once', () => {
    const server = createServer()
    let calls = 0
    server.system.run(() => {
      calls += 1
    })
    advanceTicks(server, 1)
    advanceTicks(server, 5)
    expect(calls).toBe(1)
  })
})

describe('runTimeout', () => {
  it('fires on the nth tick after scheduling', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.runTimeout(() => {
      ticks.push(server.system.currentTick)
    }, 3)
    advanceTicks(server, 2)
    expect(ticks).toEqual([])
    expect(server.system.currentTick).toBe(2)
    advanceTicks(server, 1)
    expect(ticks).toEqual([3])
  })

  it('measures the delay from the tick it was scheduled on', () => {
    const server = createServer()
    const ticks: number[] = []
    advanceTicks(server, 5)
    server.system.runTimeout(() => {
      ticks.push(server.system.currentTick)
    }, 2)
    advanceTicks(server, 5)
    expect(ticks).toEqual([7])
  })

  it('fires exactly once', () => {
    const server = createServer()
    let calls = 0
    server.system.runTimeout(() => {
      calls += 1
    }, 2)
    advanceTicks(server, 20)
    expect(calls).toBe(1)
  })

  it('is due on the next tick for a delay of zero or less, and fires only once', () => {
    const server = createServer()
    const zero: number[] = []
    const negative: number[] = []
    server.system.runTimeout(() => {
      zero.push(server.system.currentTick)
    }, 0)
    server.system.runTimeout(() => {
      negative.push(server.system.currentTick)
    }, -5)
    advanceTicks(server, 5)
    expect(zero).toEqual([1])
    expect(negative).toEqual([1])
  })

  it('is due on the next tick when the delay is omitted', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.runTimeout(() => {
      ticks.push(server.system.currentTick)
    })
    advanceTicks(server, 3)
    expect(ticks).toEqual([1])
  })
})

describe('runInterval', () => {
  it('fires every nth tick until cleared', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.runInterval(() => {
      ticks.push(server.system.currentTick)
    }, 2)
    advanceTicks(server, 10)
    expect(ticks).toEqual([2, 4, 6, 8, 10])
  })

  it('measures its period from the tick it was scheduled on', () => {
    const server = createServer()
    const ticks: number[] = []
    advanceTicks(server, 3)
    server.system.runInterval(() => {
      ticks.push(server.system.currentTick)
    }, 2)
    advanceTicks(server, 4)
    expect(ticks).toEqual([5, 7])
  })

  it('repeats every tick for an interval below one, rather than hanging the advance', () => {
    const server = createServer()
    const ticks: number[] = []
    const handle = server.system.runInterval(() => {
      ticks.push(server.system.currentTick)
    }, 0)
    advanceTicks(server, 3)
    server.system.clearRun(handle)
    expect(ticks).toEqual([1, 2, 3])
  })

  it('fires on every tick when the interval is omitted', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.runInterval(() => {
      ticks.push(server.system.currentTick)
    })
    advanceTicks(server, 3)
    expect(ticks).toEqual([1, 2, 3])
  })
})

describe('advanceTicks', () => {
  it('runs every intervening tick, not only the tick it lands on', () => {
    const server = createServer()
    const intervalTicks: number[] = []
    const timeoutTicks: number[] = []
    server.system.runInterval(() => {
      intervalTicks.push(server.system.currentTick)
    }, 2)
    server.system.runTimeout(() => {
      timeoutTicks.push(server.system.currentTick)
    }, 3)
    advanceTicks(server, 10)
    expect(intervalTicks).toEqual([2, 4, 6, 8, 10])
    expect(timeoutTicks).toEqual([3])
  })

  it("runs each tick's callbacks during the advance, with currentTick already incremented", () => {
    const server = createServer()
    const observed: number[] = []
    for (const due of [1, 2, 3]) {
      server.system.runTimeout(() => {
        observed.push(server.system.currentTick)
      }, due)
    }
    advanceTicks(server, 3)
    expect(observed).toEqual([1, 2, 3])
  })

  it("runs one tick's callbacks in scheduling order", () => {
    const server = createServer()
    const order: string[] = []
    for (const name of ['a', 'b', 'c']) {
      server.system.run(() => {
        order.push(name)
      })
    }
    advanceTicks(server, 1)
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('orders callbacks of different kinds by scheduling order within a tick', () => {
    const first = createServer()
    const firstOrder: string[] = []
    first.system.runTimeout(() => {
      firstOrder.push('x')
    }, 2)
    first.system.runInterval(() => {
      firstOrder.push('y')
    }, 2)
    advanceTicks(first, 2)
    expect(firstOrder).toEqual(['x', 'y'])

    const second = createServer()
    const secondOrder: string[] = []
    second.system.runInterval(() => {
      secondOrder.push('y')
    }, 2)
    second.system.runTimeout(() => {
      secondOrder.push('x')
    }, 2)
    advanceTicks(second, 2)
    expect(secondOrder).toEqual(['y', 'x'])
  })

  it('leaves consistent state behind a throwing callback', () => {
    const server = createServer()
    let thrower = 0
    let sibling = 0
    server.system.runTimeout(() => {
      thrower += 1
      throw new Error('deliberate')
    }, 1)
    server.system.runTimeout(() => {
      sibling += 1
    }, 1)
    expect(() => {
      advanceTicks(server, 1)
    }).toThrow('deliberate')
    // The run that threw is spent; the one it stranded is still owing and runs on the next advance.
    advanceTicks(server, 1)
    expect(thrower).toBe(1)
    expect(sibling).toBe(1)
    advanceTicks(server, 5)
    expect(thrower).toBe(1)
    expect(sibling).toBe(1)
  })

  it('advances a throwing interval to its next period rather than skipping a firing', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.runInterval(() => {
      ticks.push(server.system.currentTick)
      throw new Error('deliberate')
    }, 2)
    for (const _attempt of [1, 2, 3]) {
      expect(() => {
        advanceTicks(server, 2)
      }).toThrow('deliberate')
    }
    expect(ticks).toEqual([2, 4, 6])
  })

  it('survives a callback that advances ticks itself', () => {
    const server = createServer()
    const order: string[] = []
    server.system.runTimeout(() => {
      order.push(`outer@${String(server.system.currentTick)}`)
      advanceTicks(server, 2)
    }, 1)
    server.system.runTimeout(() => {
      order.push(`inner@${String(server.system.currentTick)}`)
    }, 3)
    advanceTicks(server, 1)
    expect(order).toEqual(['outer@1', 'inner@3'])
    expect(server.system.currentTick).toBe(3)
    advanceTicks(server, 5)
    expect(order).toEqual(['outer@1', 'inner@3'])
  })

  it('runs a callback scheduled from inside a callback on a later tick, not the current one', () => {
    const server = createServer()
    const ticks: number[] = []
    server.system.run(() => {
      server.system.run(() => {
        ticks.push(server.system.currentTick)
      })
    })
    advanceTicks(server, 3)
    expect(ticks).toEqual([2])
  })

  it('lets a throwing callback propagate out, without recording it as a handler error', () => {
    const server = createServer()
    const thrown = new Error('deliberate')
    server.system.run(() => {
      throw thrown
    })
    expect(
      thrownBy(() => {
        advanceTicks(server, 1)
      }),
    ).toBe(thrown)
  })

  it('advances only the server it was given', () => {
    const a = createServer()
    const b = createServer()
    let bCalls = 0
    b.system.run(() => {
      bCalls += 1
    })
    advanceTicks(a, 5)
    expect(b.system.currentTick).toBe(0)
    expect(bCalls).toBe(0)
  })
})

describe('clearRun', () => {
  it('discards a run before its due tick', () => {
    const server = createServer()
    let calls = 0
    server.system.clearRun(
      server.system.run(() => {
        calls += 1
      }),
    )
    advanceTicks(server, 5)
    expect(calls).toBe(0)
  })

  it('discards a pending runTimeout', () => {
    const server = createServer()
    let calls = 0
    const handle = server.system.runTimeout(() => {
      calls += 1
    }, 3)
    advanceTicks(server, 1)
    server.system.clearRun(handle)
    advanceTicks(server, 5)
    expect(calls).toBe(0)
  })

  it('stops an interval from firing again', () => {
    const server = createServer()
    let calls = 0
    const handle = server.system.runInterval(() => {
      calls += 1
    }, 2)
    advanceTicks(server, 4)
    expect(calls).toBe(2)
    server.system.clearRun(handle)
    advanceTicks(server, 10)
    expect(calls).toBe(2)
  })

  it('stops an interval cleared from inside its own callback', () => {
    const server = createServer()
    let calls = 0
    const handle = server.system.runInterval(() => {
      calls += 1
      if (calls === 3) {
        server.system.clearRun(handle)
      }
    }, 2)
    advanceTicks(server, 20)
    expect(calls).toBe(3)
  })

  it('discards only the handle given', () => {
    const server = createServer()
    let cleared = 0
    let kept = 0
    const handle = server.system.runInterval(() => {
      cleared += 1
    }, 2)
    server.system.runInterval(() => {
      kept += 1
    }, 2)
    server.system.clearRun(handle)
    advanceTicks(server, 4)
    expect(cleared).toBe(0)
    expect(kept).toBe(2)
  })

  it('ignores an unknown handle', () => {
    const server = createServer()
    let calls = 0
    server.system.run(() => {
      calls += 1
    })
    expect(() => {
      server.system.clearRun(9999)
    }).not.toThrow()
    advanceTicks(server, 1)
    expect(calls).toBe(1)
  })

  it('ignores a second clear of the same handle', () => {
    const server = createServer()
    const handle = server.system.run(() => undefined)
    server.system.clearRun(handle)
    expect(() => {
      server.system.clearRun(handle)
    }).not.toThrow()
  })
})

describe('not modelled', () => {
  it('throws NotImplementedError from runJob', () => {
    const server = createServer()
    function* generator(): Generator<void, void, void> {
      yield
    }
    const error = thrownBy(() => server.system.runJob(generator()))
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toBe('System.runJob')
    let calls = 0
    server.system.run(() => {
      calls += 1
    })
    advanceTicks(server, 10)
    expect(calls).toBe(1)
  })

  it('throws NotImplementedError from clearJob', () => {
    const { system } = createServer()
    const error = thrownBy(() => {
      system.clearJob(1)
    })
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toBe('System.clearJob')
  })

  it('throws NotImplementedError from waitTicks, sendScriptEvent, isEditorWorld and serverSystemInfo', () => {
    const { system } = createServer()
    const members: [string, () => unknown][] = [
      ['System.waitTicks', () => system.waitTicks(1)],
      [
        'System.sendScriptEvent',
        () => {
          system.sendScriptEvent('a:b', 'payload')
        },
      ],
      ['System.isEditorWorld', () => system.isEditorWorld],
      ['System.serverSystemInfo', () => system.serverSystemInfo],
    ]
    for (const [member, call] of members) {
      const error = thrownBy(call)
      expect(error).toBeInstanceOf(NotImplementedError)
      expect((error as NotImplementedError).member).toBe(member)
    }
  })

  it('checks arity ahead of everything else', () => {
    const { system } = createServer()
    const bare = system as unknown as Record<string, () => unknown>
    expect(() => bare.runTimeout()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1-2, received 0'),
    )
    expect(() => bare.clearRun()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
    expect(() => bare.runJob()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })
})
