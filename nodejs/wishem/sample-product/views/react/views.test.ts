/// <reference types="vite/client" />
import { collectViews } from '@thrashplay/wishem-renderer-react'
import { describe, expect, it } from 'vitest'
import { COLOR_TYPE, COUNTER_TYPE } from '../../src/index.js'

const table = collectViews(
  import.meta.glob('./*.view.json', { eager: true }),
  import.meta.glob('./*.tsx', { eager: true }),
)

describe('the views of the folder', () => {
  it('has one view for Color and one for Counter', () => {
    expect([...table.keys()].sort()).toEqual([COLOR_TYPE, COUNTER_TYPE].sort())
    expect(table.get(COLOR_TYPE)?.sidecar).toBe('ClearColor.view.json')
    expect(table.get(COUNTER_TYPE)?.sidecar).toBe('Count.view.json')
  })
})
