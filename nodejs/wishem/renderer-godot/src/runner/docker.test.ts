import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DOCKER_REQUIRED_MESSAGE, ensureImage, imageTag, type DockerCli } from './docker.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wishem-godot-docker-'))
  writeFileSync(join(dir, 'Dockerfile'), 'FROM scratch\n')
  writeFileSync(join(dir, 'relay.mjs'), 'console.log("relay")\n')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('imageTag', () => {
  it('starts with the Godot version', () => {
    expect(imageTag(dir)).toMatch(/^wishem-godot:4\.7\.2-[0-9a-f]{12}$/)
  })

  it('gives the same tag for the same files', () => {
    expect(imageTag(dir)).toBe(imageTag(dir))
  })

  it('gives a different tag when one byte of a file changes', () => {
    const before = imageTag(dir)
    writeFileSync(join(dir, 'relay.mjs'), 'console.log("relaz")\n')
    expect(imageTag(dir)).not.toBe(before)
  })

  it('gives a different tag when a file is added in a subfolder', () => {
    const before = imageTag(dir)
    mkdirSync(join(dir, 'extra'))
    writeFileSync(join(dir, 'extra', 'a.txt'), 'a')
    expect(imageTag(dir)).not.toBe(before)
  })
})

const fakeDocker = (handler: (args: readonly string[]) => string | undefined) => {
  const calls: (readonly string[])[] = []
  const docker: DockerCli = {
    run: (args) => {
      calls.push(args)
      return handler(args)
    },
    spawn: () => {
      throw new Error('spawn is not expected')
    },
  }
  return { docker, calls }
}

describe('ensureImage', () => {
  it('does not build an image that exists', () => {
    const { docker, calls } = fakeDocker(() => '[]')
    const lines: string[] = []

    const tag = ensureImage(docker, dir, (line) => lines.push(line))

    expect(tag).toBe(imageTag(dir))
    expect(calls.some((args) => args[0] === 'build')).toBe(false)
    expect(lines).toEqual([`wishem-godot: image ${tag} is ready`])
  })

  it('builds a missing image with its tag', () => {
    const tag = imageTag(dir)
    const { docker, calls } = fakeDocker((args) => (args[0] === 'image' ? undefined : ''))

    expect(ensureImage(docker, dir, () => undefined)).toBe(tag)

    expect(calls).toContainEqual(['build', '--tag', tag, dir])
  })

  it('throws when the build fails', () => {
    const { docker } = fakeDocker((args) => (args[0] === 'info' ? '' : undefined))
    expect(() => ensureImage(docker, dir, () => undefined)).toThrow('The build of the image failed.')
  })

  it('throws the message of the spec when docker info fails', () => {
    const { docker, calls } = fakeDocker(() => undefined)

    expect(() => ensureImage(docker, dir, () => undefined)).toThrow(DOCKER_REQUIRED_MESSAGE)
    expect(calls).toEqual([['info']])
  })
})
