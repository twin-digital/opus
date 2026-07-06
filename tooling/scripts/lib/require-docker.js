import { execaSync } from 'execa'

// Fail fast with a breadcrumb when no Docker daemon is reachable. The workspace devcontainer
// intentionally provides none (the host-socket mount gave agents root-equivalent reach onto the
// host); the replacement — an external agent-domain daemon — is tracked in
// https://github.com/twin-digital/opus/issues/164. CI runners have their own daemon and pass
// straight through.
export const requireDocker = () => {
  try {
    execaSync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 15000 })
  } catch {
    console.error('❌ No Docker daemon is reachable from this environment.')
    console.error('   The devcontainer no longer mounts the host Docker socket, and the')
    console.error('   replacement agent-domain daemon is not set up yet.')
    console.error('   See https://github.com/twin-digital/opus/issues/164')
    process.exit(1)
  }
}
