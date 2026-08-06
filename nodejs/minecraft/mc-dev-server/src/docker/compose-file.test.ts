import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { composeProject, renderComposeFile } from './compose-file.js'

import type { ComposeProjectSpec } from './compose-file.js'

const spec: ComposeProjectSpec = {
  project: 'twin-digital-opus',
  image: 'itzg/minecraft-bedrock-server:latest',
  port: 19132,
  level: 'dev',
  seed: 9223372036854775807n,
}

describe('the generated compose project', () => {
  // d-w8cc8n18 — every value is already substituted
  it('leaves nothing for compose to interpolate', () => {
    expect(renderComposeFile(spec)).not.toMatch(/\$\{/)
  })

  // d-imdfu09l — one workspace addresses one server
  it('names the project after the workspace', () => {
    expect(composeProject(spec).name).toBe('twin-digital-opus')
  })

  // r-7lroj1cg — one world at a time
  it('stands up one service serving one world', () => {
    const project = composeProject(spec) as { services: Record<string, { environment: Record<string, string> }> }

    expect(Object.keys(project.services)).toHaveLength(1)
    expect(project.services.bedrock.environment.LEVEL_NAME).toBe('dev')
  })

  // d-41m3iws5 — the seed reaches the server as the level seed, exactly
  it('carries a 64-bit seed as plain decimal', () => {
    const project = composeProject(spec) as { services: Record<string, { environment: Record<string, string> }> }

    expect(project.services.bedrock.environment.LEVEL_SEED).toBe('9223372036854775807')
  })

  // r-whacwz1b — a remote daemon, so no bind mount anywhere
  it('mounts a named volume and no host path', () => {
    const project = composeProject(spec) as {
      services: Record<string, { volumes: string[] }>
      volumes: Record<string, unknown>
    }

    expect(project.services.bedrock.volumes).toEqual(['world-data:/data'])
    expect(Object.keys(project.volumes)).toEqual(['world-data'])
  })

  // d-uqdxo2w6 — compose's own develop.watch is not used
  it('declares no develop.watch', () => {
    expect(parse(renderComposeFile(spec))).not.toHaveProperty('services.bedrock.develop')
  })

  // d-e956frnx — the posture the harness fixes
  it('runs offline with no allow list, the content log on, and resource packs offered', () => {
    const project = composeProject(spec) as { services: Record<string, { environment: Record<string, string> }> }

    expect(project.services.bedrock.environment).toMatchObject({
      ONLINE_MODE: 'false',
      ALLOW_LIST: 'false',
      TEXTUREPACK_REQUIRED: 'false',
      CONTENT_LOG_CONSOLE_OUTPUT_ENABLED: 'true',
    })
  })

  // d-wtziwjh5 — the image the harness targets
  it('targets the pinned image', () => {
    const project = composeProject({ ...spec, image: 'itzg/minecraft-bedrock-server:1.21' }) as {
      services: Record<string, { image: string }>
    }

    expect(project.services.bedrock.image).toBe('itzg/minecraft-bedrock-server:1.21')
  })
})
