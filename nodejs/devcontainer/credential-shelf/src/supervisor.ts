import { signerProfileName, writeAwsConfig } from './aws-config.js'
import { runAwsLoop } from './aws.js'
import { runGithubLoop } from './github.js'
import { log } from './shelf.js'
import type { VendConfig } from './types.js'

const PREFIX = 'credential-shelf'

/**
 * Container entrypoint: render `~/.aws/config`, then run one vend loop per provider type
 * present — the AWS loop if any aws-sso grant exists, a GitHub loop per github-app grant.
 * The loops run forever; if any settles (an unexpected crash), exit non-zero so the
 * container's restart policy revives them all together. No providers → idle.
 */
export const start = async (cfg: VendConfig): Promise<void> => {
  const vendProfiles = writeAwsConfig(cfg)

  const loops: Promise<never>[] = []
  if (vendProfiles.length > 0) {
    log(PREFIX, `aws-sso: vending ${vendProfiles.length.toString()} profile(s)`)
    loops.push(runAwsLoop(vendProfiles))
  }
  for (const p of cfg.providers) {
    if (p.kind !== 'github-app') {
      continue
    }
    for (const grant of p.grants) {
      loops.push(
        runGithubLoop({
          appId: p.appId,
          kmsKeyId: p.kmsKeyId,
          region: p.region,
          signerProfile: signerProfileName(p.signer.accountId, p.signer.role),
          grant,
        }),
      )
    }
  }

  if (loops.length === 0) {
    log(PREFIX, 'no providers configured; idling (bake a vend.yaml to vend)')
    await new Promise(() => {
      /* idle forever */
    })
    return
  }

  log(PREFIX, `started ${loops.length.toString()} vend loop(s)`)
  await Promise.race(loops)
  log(PREFIX, 'a vend loop exited; exiting so the container restart policy revives all')
  process.exitCode = 1
}
