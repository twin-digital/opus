// The deploy transport: one idempotent path that makes the server's pack state
// match the built packs. Used for the full startup reconcile and for
// incremental ships from the file watcher — compose's role is only to define
// and run the server container.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { execa } from 'execa'

const color = (line) => `\x1b[35m[deploy]\x1b[0m ${line}`
const log = (line) => {
  console.log(color(line))
}

export const createDeployer = ({ composeArgs, root }) => {
  const compose = (args, options = {}) => execa('docker', [...composeArgs, ...args], { cwd: root, ...options })
  const shell = (script, options = {}) => compose(['exec', '-T', 'bedrock', 'sh', '-c', script], options)

  /** Ship one pack's built dist/ into the server's development pool. */
  const syncPack = async (pack) => {
    const target = `/data/development_behavior_packs/${pack.name}`
    // Replace rather than overlay, so files deleted from dist/ don't linger.
    await shell(`rm -rf ${JSON.stringify(target)} && mkdir -p ${JSON.stringify(target)}`)
    await compose(['cp', `${pack.distDir}/.`, `bedrock:${target}`])
  }

  /** Hot-reload scripts/functions in the running server. */
  const reload = () => compose(['exec', '-T', 'bedrock', 'send-command', 'reload'])

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

  /** The desired activation list, read from the built (validated) manifests. */
  const desiredActivation = (packs) =>
    packs.map((pack) => {
      const manifest = JSON.parse(readFileSync(join(pack.distDir, 'manifest.json'), 'utf8'))
      return { pack_id: manifest.header.uuid, version: manifest.header.version }
    })

  const activationMatches = (currentRaw, desired) => {
    const normalize = (entries) => JSON.stringify([...entries].sort((a, b) => a.pack_id.localeCompare(b.pack_id)))
    try {
      return normalize(JSON.parse(currentRaw)) === normalize(desired)
    } catch {
      return false // missing or malformed
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

  /**
   * Full reconcile, run at startup with the server already healthy: prune
   * stale pool folders (renamed/removed packs leave duplicate-uuid copies the
   * server may arbitrarily prefer), ship every pack, and install the world's
   * activation list when it differs — the list is only read at boot, so an
   * install ends with a restart. Otherwise a single /reload picks up the
   * shipped packs.
   */
  const reconcile = async (packs) => {
    const keep = packs.map((pack) => pack.name).join(' ')
    const { stdout: pruned } = await shell(
      `cd /data/development_behavior_packs 2>/dev/null || exit 0
       for d in */; do
         d="\${d%/}"
         [ -d "$d" ] || continue
         case " ${keep} " in
           *" $d "*) ;;
           *) echo "$d"; rm -rf "$d" ;;
         esac
       done`,
    )
    for (const name of pruned.split('\n').filter(Boolean)) {
      log(`pruned stale pack folder: ${name}`)
    }

    for (const pack of packs) {
      await syncPack(pack)
    }

    const desired = desiredActivation(packs)
    const { stdout: level } = await shell('echo "${LEVEL_NAME:-dev}"')
    const worldFile = `/data/worlds/${level.trim()}/world_behavior_packs.json`
    const { stdout: current } = await shell(`cat ${JSON.stringify(worldFile)} 2>/dev/null || true`)
    if (activationMatches(current, desired)) {
      await reload()
      log('packs shipped; world activation up to date')
      return
    }

    log('installing world pack activation (server will restart)…')
    await shell(`cat > ${JSON.stringify(worldFile)}`, { input: `${JSON.stringify(desired, null, 2)}\n` })
    await compose(['restart', 'bedrock'])
    if (!(await waitHealthy())) {
      console.warn(color('⚠ server not healthy after restart — check the server logs'))
      return
    }
    const { stdout: after } = await shell(`cat ${JSON.stringify(worldFile)} 2>/dev/null || true`)
    if (activationMatches(after, desired)) {
      log('world pack activation installed')
    } else {
      console.warn(color('⚠ pack activation still differs after install — check the server logs'))
    }
  }

  return { deployPacks, reconcile }
}
