import path from 'node:path'
import { execa, type ExecaError, type Result } from 'execa'
import { getDeploymentConfig } from '../config/get-deployment-config.js'

export const execTf = (args: string[]): Promise<Result | ExecaError> => {
  const config = getDeploymentConfig()
  const extraArgs: string[] = []

  // subcommand should be the first argument that isn't a global option (i.e., doesn't start with a hyphen)
  const subcommand = args.find((arg) => !arg.startsWith('-'))
  if (subcommand === 'init') {
    // the 'init' subcommand requires us to pass backend config
    if (config.roleArn) {
      extraArgs.push(`-backend-config=role_arn=${config.roleArn}`)
      extraArgs.push(`-backend-config=session_name=terraform-backend`)
    } else {
      extraArgs.push(`-backend-config=profile=${config.profile}`)
    }
  }

  console.warn(path.resolve('terraform', 'stages', 'default'))

  return execa({
    buffer: false,
    cwd: path.resolve('terraform', 'stages', 'default'),
    env: {
      TF_VARS_profile: config.profile,
      TF_VARS_role_arn: config.roleArn,
      TF_VARS_stage: config.stage,
    },
    reject: false,
    stdout: 'inherit',
    stderr: 'inherit',
  })('terraform', [...args, ...extraArgs])
}
