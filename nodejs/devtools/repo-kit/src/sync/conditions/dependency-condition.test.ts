import { describe, it, expect } from 'vitest'
import type { ProjectManifest } from '@pnpm/types'

import { makeDependencyCondition } from './dependency-condition.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

const workspaceWith = (manifest: Partial<ProjectManifest>): PackageMeta => ({
  manifest: { name: 'pkg', ...manifest } as ProjectManifest,
  name: 'pkg',
  path: '/tmp/pkg',
})

describe('makeDependencyCondition', () => {
  it('matches a normal dependency by default', async () => {
    const condition = makeDependencyCondition('react')
    expect(await condition(workspaceWith({ dependencies: { react: '^19.0.0' } }))).toBe(true)
  })

  it('matches a devDependency by default', async () => {
    const condition = makeDependencyCondition('vitest')
    expect(await condition(workspaceWith({ devDependencies: { vitest: 'catalog:' } }))).toBe(true)
  })

  it('matches a peerDependency by default', async () => {
    const condition = makeDependencyCondition('react')
    expect(await condition(workspaceWith({ peerDependencies: { react: '*' } }))).toBe(true)
  })

  it('does NOT match an optionalDependency by default', async () => {
    const condition = makeDependencyCondition('fsevents')
    expect(await condition(workspaceWith({ optionalDependencies: { fsevents: '*' } }))).toBe(false)
  })

  it('matches an optionalDependency when explicitly enabled', async () => {
    const condition = makeDependencyCondition('fsevents', { optionalDependency: true })
    expect(await condition(workspaceWith({ optionalDependencies: { fsevents: '*' } }))).toBe(true)
  })

  it('ignores a dependency type that has been disabled', async () => {
    const condition = makeDependencyCondition('vitest', { devDependency: false })
    expect(await condition(workspaceWith({ devDependencies: { vitest: 'catalog:' } }))).toBe(false)
  })

  it('returns false when the dependency is absent entirely', async () => {
    const condition = makeDependencyCondition('react')
    expect(await condition(workspaceWith({ dependencies: { vue: '^3' } }))).toBe(false)
  })
})
