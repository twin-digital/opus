import { describe, expect, it, vi } from 'vitest'
import { createCore, ModelError } from './core.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const workbench = (title = 'Wishem', label = 'AppBar') => ({
  definitions: [{ id: CT, label, fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: ENT, components: { [CT]: { [FLD]: title } } }],
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
    expect((thrown as ModelError).problems).toHaveLength(1)
    expect((thrown as ModelError).problems[0]?.severity).toBe('error')
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
})
