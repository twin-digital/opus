// The deploy transport: one idempotent path that makes the server's pack state
// match the built packs. Used for the full startup reconcile and for
// incremental ships from the file watcher — compose's role is only to define
// and run the server container.
//
// Everything the container-side needs is expressed as plain argv commands
// (execa arrays — no shell, no quoting); file contents move via compose cp.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { execa } from 'execa'

const POOL_DIR = '/data/development_behavior_packs'

const color = (line) => `\x1b[35m[deploy]\x1b[0m ${line}`
const log = (line) => {
  console.log(color(line))
}

export const createDeployer = ({ composeArgs, root }) => {
  const compose = (args, options = {}) => execa('docker', [...composeArgs, ...args], { cwd: root, ...options })
  const container = (args, options = {}) => compose(['exec', '-T', 'bedrock', ...args], options)

  /** Ship one pack's built dist/ into the server's development pool. */
  const syncPack = async (pack) => {
    const target = `${POOL_DIR}/${pack.name}`
    // Replace rather than overlay, so files deleted from dist/ don't linger.
    await container(['rm', '-rf', target])
    await container(['mkdir', '-p', target])
    await compose(['cp', `${pack.distDir}/.`, `bedrock:${target}`])
  }

  /** Hot-reload scripts/functions in the running server. */
  const reload = () => container(['send-command', 'reload'])

  /**
   * Ship a set of packs and reload — the incremental path the file watcher
   * drives. Failures warn rather than throw: the watcher keeps running and the
   * next save retries.
   */
  const deployPacks = async (packs) => {
    try {
      for (const pack of packs) {
        await syncPack(pack)
      }
      await reload()
      log(`shipped ${packs.map((pack) => pack.name).join(', ')} → /reload`)
    } catch (error) {
      console.warn(color(`⚠ deploy failed (${error.stderr?.trim() || error.message}) — will retry on next change`))
    }
  }

  /** The world directory, from the running container's environment. */
  const worldDir = async () => {
    const level = await container(['printenv', 'LEVEL_NAME']).then(
      ({ stdout }) => stdout.trim(),
      () => '', // unset — printenv exits non-zero
    )
    return `/data/worlds/${level || 'dev'}`
  }

  /** The desired activation list, read from the built (validated) manifests. */
  const desiredActivation = (packs) =>
    packs.map((pack) => {
      const manifest = JSON.parse(readFileSync(join(pack.distDir, 'manifest.json'), 'utf8'))
      return { pack_id: manifest.header.uuid, version: manifest.header.version }
    })

  /** The world's current activation list, or null when missing/malformed. */
  const currentActivation = (activationFile) =>
    container(['cat', activationFile]).then(
      ({ stdout }) => {
        try {
          return JSON.parse(stdout)
        } catch {
          return null
        }
      },
      () => null, // file missing
    )

  const activationMatches = (current, desired) => {
    if (current === null) {
      return false
    }
    const normalize = (entries) => JSON.stringify([...entries].sort((a, b) => a.pack_id.localeCompare(b.pack_id)))
    return normalize(current) === normalize(desired)
  }

  const installActivation = async (activationFile, desired) => {
    const staging = mkdtempSync(join(tmpdir(), 'mc-activation-'))
    try {
      const file = join(staging, 'world_behavior_packs.json')
      writeFileSync(file, `${JSON.stringify(desired, null, 2)}\n`)
      await compose(['cp', file, `bedrock:${activationFile}`])
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }

  const waitHealthy = async () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { stdout } = await compose(['ps', '--format', 'json', 'bedrock'])
      try {
        if (JSON.parse(stdout).Health === 'healthy') {
          return true
        }
      } catch {
        // not up yet / unexpected output — keep waiting
      }
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
    return false
  }

  /** Remove pool folders that no longer correspond to a current pack. */
  const prunePool = async (packs) => {
    const keep = new Set(packs.map((pack) => pack.name))
    const entries = await container(['ls', '-1', POOL_DIR]).then(
      ({ stdout }) => stdout.split('\n').filter(Boolean),
      () => [], // pool doesn't exist yet
    )
    for (const entry of entries.filter((name) => !keep.has(name))) {
      await container(['rm', '-rf', `${POOL_DIR}/${entry}`])
      log(`pruned stale pack folder: ${entry}`)
    }
  }

  /**
   * Full reconcile, run at startup with the server already healthy: prune
   * stale pool folders (renamed/removed packs leave duplicate-uuid copies the
   * server may arbitrarily prefer), ship every pack, and install the world's
   * activation list when it differs — the list is only read at boot, so an
   * install ends with a restart. Otherwise a single /reload picks up the
   * shipped packs.
   */
  const reconcile = async (packs) => {
    await prunePool(packs)
    for (const pack of packs) {
      await syncPack(pack)
    }

    const desired = desiredActivation(packs)
    const activationFile = `${await worldDir()}/world_behavior_packs.json`
    if (activationMatches(await currentActivation(activationFile), desired)) {
      await reload()
      log('packs shipped; world activation up to date')
      return
    }

    log('installing world pack activation (server will restart)…')
    await installActivation(activationFile, desired)
    await compose(['restart', 'bedrock'])
    if (!(await waitHealthy())) {
      console.warn(color('⚠ server not healthy after restart — check the server logs'))
      return
    }
    if (activationMatches(await currentActivation(activationFile), desired)) {
      log('world pack activation installed')
    } else {
      console.warn(color('⚠ pack activation still differs after install — check the server logs'))
    }
  }

  return { deployPacks, reconcile }
}
