// Config comes from the environment, set by the systemd unit. No dotenv: a
// supervised service is configured by its unit, not a working-directory file.

const intEnv = (name: string, fallback: number) => {
  const v = process.env[name]
  if (!v) {
    return fallback
  }
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

const strEnv = (name: string, fallback: string) => process.env[name] ?? fallback

// Where the broker listens. A Unix domain socket, not a TCP port: local-only,
// authenticated by filesystem permissions (root:minecraft 0660), so root
// (nightly create-backup) and the minecraft user (web UI, timer) both reach it
// with no shared secret and no network surface.
export const SOCKET_PATH = strEnv('MINECRAFT_API_SOCKET', '/run/minecraft/api.sock')

// The screen console the Bedrock server runs in. Commands are sent through the
// existing unprivileged helper (it drives `screen -X stuff` and asserts the
// log flush); replies come back on bedrock's stdout, which screen tees into
// CONSOLE_LOG. This broker is the SOLE writer to that console.
export const CONSOLE_SCRIPT = strEnv('MINECRAFT_CONSOLE', '/usr/local/bin/minecraft-console')
export const CONSOLE_LOG = strEnv('MINECRAFT_CONSOLE_LOG', '/var/log/minecraft/console.log')

export const SERVICE_NAME = strEnv('MINECRAFT_SERVICE_NAME', 'minecraft.service')
export const SERVER_ROOT = strEnv('MINECRAFT_SERVER_ROOT', '/opt/minecraft/versions/current')

// Reply timeouts. A healthy console (screen flush set to 0) answers in well
// under a second; the fast bound is for probes on a UI load path where a stuck
// console must degrade quickly rather than block.
export const CONSOLE_TIMEOUT_MS = intEnv('MINECRAFT_CONSOLE_TIMEOUT_MS', 10_000)
export const CONSOLE_TIMEOUT_FAST_MS = intEnv('MINECRAFT_CONSOLE_TIMEOUT_FAST_MS', 2_000)
export const CONSOLE_POLL_MS = intEnv('MINECRAFT_CONSOLE_POLL_MS', 100)

// How long to wait for `save query` to report the ready marker + file list.
export const SAVE_QUERY_TIMEOUT_MS = intEnv('MINECRAFT_SAVE_QUERY_TIMEOUT_MS', 120_000)

export const LOG_LEVEL = strEnv('LOG_LEVEL', 'info')

export default {
  SOCKET_PATH,
  CONSOLE_SCRIPT,
  CONSOLE_LOG,
  SERVICE_NAME,
  SERVER_ROOT,
  CONSOLE_TIMEOUT_MS,
  CONSOLE_TIMEOUT_FAST_MS,
  CONSOLE_POLL_MS,
  SAVE_QUERY_TIMEOUT_MS,
  LOG_LEVEL,
}
