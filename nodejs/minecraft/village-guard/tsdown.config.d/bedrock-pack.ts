// Managed by repo-kit. A behavior pack bundles src/main.ts to
// dist/scripts/main.js, keeps @minecraft/* external (the game runtime
// provides them), and assembles the shippable manifest into dist/ so
// dist/ is a complete installable pack — see @twin-digital/mc-pack-config.
import { defineBedrockPackConfig } from '@twin-digital/mc-pack-config'

export default defineBedrockPackConfig(import.meta.url)
