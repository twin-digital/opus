import { describe, expect, it } from 'vitest'
import * as root from './index.js'

describe('the root entry', () => {
  it('exports the runner and the Docker helpers', () => {
    expect(Object.keys(root).sort()).toEqual([
      'DOCKER_REQUIRED_MESSAGE',
      'createDockerCli',
      'ensureImage',
      'imageTag',
      'runGodot',
    ])
  })

  it('exports no construct', () => {
    expect(root).not.toHaveProperty('startGodotConstruct')
  })
})
