// Managed by repo-kit. Configures externals for libraries provided by
// the server and assembles the shippable manifest into dist/ — see
// @twin-digital/mc-pack-config.
import { defineBedrockPackConfig } from '@twin-digital/mc-pack-config'

export default defineBedrockPackConfig(import.meta.url)
