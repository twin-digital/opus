import { describe, expect, it } from 'vitest'
import { validateModel } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { modelFolder } from './index.js'

describe('the base workbench model', () => {
  it('is a correct model with one AppBar entity', async () => {
    const folder = await readModelFolder(modelFolder)
    expect(folder.problems).toEqual([])

    const result = validateModel(folder.data)
    if (!result.ok) {
      expect.fail(JSON.stringify(result.problems))
    }

    expect(result.warnings).toEqual([])
    expect(result.model.definitions).toHaveLength(1)
    const type = result.model.definitions[0]
    expect(type.label).toBe('AppBar')
    expect(type.fields).toHaveLength(1)
    expect(type.fields[0]).toMatchObject({ label: 'title', type: 'string' })

    expect(result.model.entities).toHaveLength(1)
    expect(Object.keys(result.model.entities[0].components)).toEqual([type.id])
  })

  it('gives the app bar the title Wishem', async () => {
    const folder = await readModelFolder(modelFolder)
    const result = validateModel(folder.data)
    if (!result.ok) {
      expect.fail(JSON.stringify(result.problems))
    }

    const type = result.model.definitions[0]
    const title = type.fields[0]
    expect(result.model.entities[0].components[type.id]).toEqual({ [title.id]: 'Wishem' })
  })
})
