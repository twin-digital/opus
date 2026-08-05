import { describe, expect, it } from 'vitest'

import { projectNameFor } from './workspace.js'

describe('projectNameFor', () => {
  // d-imdfu09l — one workspace addresses one server, whatever directory the run started in
  it('sluggifies a scoped package name', () => {
    expect(projectNameFor('@twin-digital/opus')).toBe('twin-digital-opus')
  })

  it('keeps a plain name', () => {
    expect(projectNameFor('my-workspace')).toBe('my-workspace')
  })

  it('lowercases and collapses', () => {
    expect(projectNameFor('My  Workspace!!')).toBe('my-workspace')
  })

  it('starts the name with an alphanumeric', () => {
    expect(projectNameFor('_leading')).toBe('leading')
    expect(projectNameFor('!!!')).toBe('mc-workspace')
  })
})
