// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchConfig {
  action: string
  path: string
  target?: string
}

export interface BuildConfig {
  context: string
  dockerfile?: string
  dockerfile_inline?: string
  args?: Record<string, string>
}

export interface ServerlessFunction {
  handler?: string
  image?: {
    name: string
    command?: string[]
  }
  events?: {
    httpApi?: {
      path: string
      method: string
    }
  }[]
}

export interface ServerlessConfig {
  service: string
  provider: {
    ecr?: {
      images?: Record<
        string,
        {
          path: string
          file: string
          buildArgs?: Record<string, string>
        }
      >
    }
  }
  functions: Record<string, ServerlessFunction>
}

export interface DockerService {
  build?: BuildConfig
  image?: string
  command?: string[]
  ports?: string[]
  expose?: string[]
  environment?: string[]
  depends_on?: string[]
  develop?: {
    watch: WatchConfig[]
  }
}

export interface DockerComposeFile {
  'x-lambda-watch': WatchConfig[]
  'x-zip-lambda-build': BuildConfig
  services: Record<string, DockerService>
}
