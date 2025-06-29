import os from 'node:os'

export interface BaseDeploymentConfig {
  /**
   * Name of the AWS profile to use for deployment. Exactly one of `profile` or `roleArn` will be set.
   */
  profile?: string

  /**
   * ARN of the AWS role to assume for deployment.  Exactly one of `profile` or `roleArn` will be set.
   */
  roleArn?: string

  /**
   * Name of the stage to which we are deploying
   */
  stage: string
}

export interface ProfileDeploymentConfig extends BaseDeploymentConfig {
  profile: string
  roleArn?: undefined
}

export interface RoleDeploymentConfig extends BaseDeploymentConfig {
  profile?: undefined
  roleArn: string
}

export type DeploymentConfig = ProfileDeploymentConfig | RoleDeploymentConfig

const getSandboxProfile = (): string => 'twin-digital-sandbox'

/**
 * Retrieves the 'sandbox' stage for the current environment. This is the value of the `USER_ID` environment variable,
 * if one is set. Otherwise, it is the username returned by the OS.
 */
const getSandboxStage = (): string =>
  process.env.USER_ID ?? os.userInfo().username

/**
 * Returns the stage to which we are deploying. If the `STAGE` environment variable is set, this will be that value.
 * Otherwise, the user-specific sandbox stage is used instead. (See `getSandboxStage`.)
 */
export const getStage = (): string => process.env.STAGE ?? getSandboxStage()

/**
 * Examines the current script's execution environment and returns the necessary configuration for deployment.
 */
export const getDeploymentConfig = (): DeploymentConfig => {
  const stage = getStage()
  return process.env.AWS_ROLE_ARN ?
      {
        roleArn: process.env.AWS_ROLE_ARN,
        stage,
      }
    : {
        profile: getSandboxProfile(),
        stage,
      }
}
