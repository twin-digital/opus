import { describe, expect, it, vi } from 'vitest'
import { createCore, ModelError } from './core.js'
import type { Snapshot } from './model.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const FLD2 = 'fld_11111111-2222-4333-8444-555555555555'
const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const workbench = (title = 'Wishem', label = 'AppBar') => ({
  definitions: [{ id: CT, label, fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: ENT, components: { [CT]: { [FLD]: title } } }],
})

// The same model with a different order of the keys of each record.
const twoFields = (reorder: boolean) => {
  const fields = [
    { id: FLD, label: 'title', type: 'string' },
    { id: FLD2, label: 'subtitle', type: 'string' },
  ]
  const values = reorder ? { [FLD2]: 'b', [FLD]: 'a' } : { [FLD]: 'a', [FLD2]: 'b' }
  return reorder ?
      {
        entities: [{ components: { [CT]: values }, id: ENT }],
        definitions: [{ fields, label: 'AppBar', id: CT }],
      }
    : {
        definitions: [{ id: CT, label: 'AppBar', fields }],
        entities: [{ id: ENT, components: { [CT]: values } }],
      }
}

const twoProblems = () => ({
  definitions: [],
  entities: [
    { id: ENT, components: { [CT]: {} } },
    { id: 'e_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', components: { [CT]: {} } },
  ],
})

const notCorrect = () => ({
  definitions: [],
  entities: [{ id: ENT, components: { [CT]: {} } }],
})

describe('createCore', () => {
  it('gives the snapshot of the base workbench', () => {
    const snapshot = createCore(workbench()).getSnapshot()
    expect(snapshot.definitions).toHaveLength(1)
    expect(snapshot.definitions[0]?.label).toBe('AppBar')
    expect(snapshot.definitions[0]?.fields[0]?.label).toBe('title')
    expect(snapshot.entities).toHaveLength(1)
    expect(snapshot.entities[0]?.components[CT]?.[FLD]).toBe('Wishem')
  })

  it('gives equal snapshots when the model does not change', () => {
    const core = createCore(workbench())
    expect(core.getSnapshot()).toEqual(core.getSnapshot())
  })

  it('throws a ModelError with the problems for a model that is not correct', () => {
    let thrown: unknown
    try {
      createCore(notCorrect())
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ModelError)
    expect((thrown as ModelError).name).toBe('ModelError')
    expect((thrown as ModelError).problems).toHaveLength(1)
    expect((thrown as ModelError).problems[0]?.severity).toBe('error')
    expect((thrown as ModelError).message).toContain((thrown as ModelError).problems[0]?.message)
  })

  it('gives every problem in the ModelError', () => {
    let thrown: unknown
    try {
      createCore(twoProblems())
    } catch (error) {
      thrown = error
    }
    expect((thrown as ModelError).problems).toHaveLength(2)
    for (const problem of (thrown as ModelError).problems) {
      expect((thrown as ModelError).message).toContain(problem.message)
    }
  })
})

describe('subscribe and setModel', () => {
  it('sends one snapshot after a change to the authored state', () => {
    const core = createCore(workbench())
    const listener = vi.fn()
    core.subscribe(listener)
    const result = core.setModel(workbench('Wishem workbench'))
    expect(result.ok).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ entities: workbench('Wishem workbench').entities }))
  })

  it('sends one snapshot after a change to a definition', () => {
    const core = createCore(workbench())
    const listener = vi.fn()
    core.subscribe(listener)
    core.setModel(workbench('Wishem', 'Header'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ definitions: workbench('Wishem', 'Header').definitions }),
    )
  })

  it('sends no snapshot to a listener that stopped, and the core continues', () => {
    const core = createCore(workbench())
    const stopped = vi.fn()
    const active = vi.fn()
    const stop = core.subscribe(stopped)
    core.subscribe(active)
    stop()
    core.setModel(workbench('Changed'))
    expect(stopped).not.toHaveBeenCalled()
    expect(active).toHaveBeenCalledTimes(1)
    expect(core.getSnapshot().entities[0]?.components[CT]?.[FLD]).toBe('Changed')
  })

  it('sends no snapshot for an equal model with a different order of keys', () => {
    const core = createCore(twoFields(false))
    const listener = vi.fn()
    core.subscribe(listener)
    expect(core.setModel(twoFields(true)).ok).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('sends a snapshot when the model returns to an earlier model', () => {
    const core = createCore(workbench('First'))
    const listener = vi.fn()
    core.subscribe(listener)
    core.setModel(workbench('Second'))
    core.setModel(workbench('First'))
    expect(listener).toHaveBeenCalledTimes(2)
    expect(core.getSnapshot().entities[0]?.components[CT]?.[FLD]).toBe('First')
  })

  it('calls a function that has two registrations once for each, and stops one at a time', () => {
    const core = createCore(workbench())
    const listener = vi.fn()
    const stopFirst = core.subscribe(listener)
    core.subscribe(listener)
    core.setModel(workbench('One'))
    expect(listener).toHaveBeenCalledTimes(2)
    stopFirst()
    core.setModel(workbench('Two'))
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('calls the listeners in the order of registration', () => {
    const core = createCore(workbench())
    const calls: string[] = []
    core.subscribe(() => calls.push('first'))
    core.subscribe(() => calls.push('second'))
    core.subscribe(() => calls.push('third'))
    core.setModel(workbench('Next'))
    expect(calls).toEqual(['first', 'second', 'third'])
  })

  it('continues the notification when a listener stops itself, and sends it no later snapshot', () => {
    const core = createCore(workbench())
    const other = vi.fn()
    const stopper = vi.fn(() => {
      stop()
    })
    const stop = core.subscribe(stopper)
    core.subscribe(other)
    core.setModel(workbench('One'))
    core.setModel(workbench('Two'))
    expect(stopper).toHaveBeenCalledTimes(1)
    expect(other).toHaveBeenCalledTimes(2)
  })

  it('sends a listener that a listener registers during a notification only later snapshots', () => {
    const core = createCore(workbench())
    const late = vi.fn()
    let registered = false
    core.subscribe(() => {
      if (!registered) {
        registered = true
        core.subscribe(late)
      }
    })
    core.setModel(workbench('One'))
    expect(late).not.toHaveBeenCalled()
    core.setModel(workbench('Two'))
    expect(late).toHaveBeenCalledTimes(1)
  })

  it('sends no snapshot for an equal model', () => {
    const core = createCore(workbench())
    const listener = vi.fn()
    core.subscribe(listener)
    expect(core.setModel(workbench()).ok).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps the current model and sends no snapshot for a model that is not correct', () => {
    const core = createCore(workbench())
    const before = core.getSnapshot()
    const listener = vi.fn()
    core.subscribe(listener)
    const result = core.setModel(notCorrect())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems).toHaveLength(1)
    }
    expect(core.getSnapshot()).toEqual(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it('holds and sends a correct model after a model that was refused', () => {
    const core = createCore(workbench())
    const listener = vi.fn()
    core.subscribe(listener)
    core.setModel(notCorrect())
    core.setModel(workbench('After'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(core.getSnapshot().entities[0]?.components[CT]?.[FLD]).toBe('After')
  })
})

describe('the result of setModel', () => {
  it('holds every problem for a model that is not correct', () => {
    const core = createCore(workbench())
    const result = core.setModel(twoProblems())
    expect(!result.ok && result.problems).toHaveLength(2)
  })

  it('holds the warnings for a correct model', () => {
    const core = createCore(workbench())
    const next = workbench('Next')
    next.definitions.push({ id: 'ct_7d1e2f30-4a5b-4c6d-8e7f-90a1b2c3d4e5', label: 'AppBar', fields: [] })
    const result = core.setModel(next)
    expect(result.ok && result.warnings).toHaveLength(1)
  })
})

describe('snapshot protection', () => {
  it('throws a TypeError when a caller changes the snapshot, and keeps the model', () => {
    const core = createCore(workbench())
    const snapshot = core.getSnapshot() as unknown as { entities: { id: string }[] }
    expect(() => {
      snapshot.entities[0].id = 'changed'
    }).toThrow(TypeError)
    expect(() => {
      snapshot.entities.push({ id: 'extra' })
    }).toThrow(TypeError)
    expect(core.getSnapshot().entities).toHaveLength(1)
    expect(core.getSnapshot().entities[0]?.id).toBe(ENT)
  })

  it('throws a TypeError at every level of the snapshot, for the first and for a later model', () => {
    const attempts = (snapshot: Snapshot): (() => void)[] => {
      const writable = snapshot as unknown as {
        definitions: { label: string; fields: { label: string }[] }[] | undefined
        entities: { components: Record<string, Record<string, string>> }[]
      }
      return [
        () => {
          writable.definitions = undefined
        },
        () => {
          writable.definitions?.push({ label: 'x', fields: [] })
        },
        () => {
          writable.entities[0].components[CT][FLD] = 'x'
        },
        () => {
          writable.entities[0].components[CT][FLD2] = 'x'
        },
        () => {
          writable.entities[0].components[FLD2] = {}
        },
        () => {
          writable.definitions![0].label = 'x'
        },
        () => {
          writable.definitions![0].fields.push({ label: 'x' })
        },
        () => {
          writable.definitions![0].fields[0].label = 'x'
        },
      ]
    }
    const core = createCore(workbench())
    const sent: Snapshot[] = []
    core.subscribe((snapshot) => sent.push(snapshot))
    core.setModel(workbench('Next'))
    for (const snapshot of [createCore(workbench()).getSnapshot(), sent[0], core.getSnapshot()]) {
      for (const attempt of attempts(snapshot)) {
        expect(attempt).toThrow(TypeError)
      }
    }
  })

  it('throws a TypeError when a listener changes the snapshot, and keeps the model', () => {
    const core = createCore(workbench())
    const attempts: unknown[] = []
    core.subscribe((snapshot) => {
      try {
        ;(snapshot as unknown as { entities: unknown[] }).entities.length = 0
      } catch (error) {
        attempts.push(error)
      }
    })
    core.setModel(workbench('Next'))
    expect(attempts[0]).toBeInstanceOf(TypeError)
    expect(core.getSnapshot().entities).toHaveLength(1)
    expect(core.getSnapshot().entities[0]?.components[CT]?.[FLD]).toBe('Next')
  })
})

describe('a listener that throws', () => {
  it('lets every listener run, throws an AggregateError, and keeps the new model', () => {
    const core = createCore(workbench())
    const first = vi.fn()
    const third = vi.fn()
    core.subscribe(first)
    core.subscribe(() => {
      throw new Error('listener failed')
    })
    core.subscribe(third)
    let thrown: unknown
    try {
      core.setModel(workbench('Next'))
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toHaveLength(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(third).toHaveBeenCalledTimes(1)
    expect(core.getSnapshot().entities[0]?.components[CT]?.[FLD]).toBe('Next')
  })

  it('collects the error of each listener that throws, in order, and the error is the original', () => {
    const core = createCore(workbench())
    const errorOne = new Error('one')
    const errorTwo = new Error('two')
    core.subscribe(() => {
      throw errorOne
    })
    core.subscribe(() => {
      throw errorTwo
    })
    let thrown: unknown
    try {
      core.setModel(workbench('Next'))
    } catch (error) {
      thrown = error
    }
    const errors = (thrown as AggregateError).errors as unknown[]
    expect(errors).toHaveLength(2)
    expect(errors[0]).toBe(errorOne)
    expect(errors[1]).toBe(errorTwo)
  })

  it('does not throw for a later change when the listeners do not throw', () => {
    const core = createCore(workbench())
    let fail = true
    core.subscribe(() => {
      if (fail) {
        fail = false
        throw new Error('listener failed')
      }
    })
    expect(() => core.setModel(workbench('One'))).toThrow(AggregateError)
    expect(() => core.setModel(workbench('Two'))).not.toThrow()
  })

  it('gives the new snapshot to a listener that asks the core for it', () => {
    const core = createCore(workbench())
    let current: Snapshot | undefined
    core.subscribe((snapshot) => {
      current = core.getSnapshot()
      expect(current).toEqual(snapshot)
    })
    core.setModel(workbench('Next'))
    expect(current?.entities[0]?.components[CT]?.[FLD]).toBe('Next')
  })
})
