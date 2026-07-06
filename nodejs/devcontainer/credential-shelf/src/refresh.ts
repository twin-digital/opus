import { writeAwsConfig } from './aws-config.js'
import { vendAwsOnce } from './aws.js'
import { runInteractive } from './exec.js'
import { log } from './shelf.js'
import type { VendConfig } from './types.js'

const PREFIX = 'refresh-credentials'

/** The distinct `[sso-session]` names across all aws-sso providers (device-code login targets). */
export const distinctAwsSessions = (cfg: VendConfig): string[] => [
  ...new Set(cfg.providers.filter((p) => p.kind === 'aws-sso').map((p) => p.session)),
]

/**
 * Log in to every distinct aws-sso session (device-code flow — no profile name to
 * remember) and vend AWS once, so fresh creds hit the shelf immediately; the GitHub loops
 * re-mint on their own once the signer session is back. The one recurring step when a
 * session lapses. Run via `docker exec -it <project>-credentials-1 credential-shelf refresh`.
 */
export const refresh = async (cfg: VendConfig): Promise<void> => {
  const vendProfiles = writeAwsConfig(cfg)

  const sessions = distinctAwsSessions(cfg)
  if (sessions.length === 0) {
    log(PREFIX, 'no aws-sso providers configured; nothing to log in')
    process.exitCode = 1
    return
  }

  for (const session of sessions) {
    log(PREFIX, `logging in to sso-session '${session}' (device code)…`)
    await runInteractive('aws', ['sso', 'login', '--sso-session', session, '--use-device-code'])
  }

  if (vendProfiles.length > 0) {
    log(PREFIX, 'vending fresh AWS credentials to the shelf…')
    await vendAwsOnce(vendProfiles)
  }
  log(PREFIX, 'done — shelf refreshed; check: cat /creds/status/*')
}
