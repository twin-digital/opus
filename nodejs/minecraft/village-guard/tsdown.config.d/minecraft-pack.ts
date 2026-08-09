// Managed by repo-kit. The pack build is the dev kit's: it completes each manifest,
// copies the pack's assets, and prunes output the build did not write, so a finished
// dist/ loads as it stands. See @twin-digital/mc-dev-kit.
import { packBuild } from '@twin-digital/mc-dev-kit/build'

export default packBuild({ packageDir: new URL('..', import.meta.url).pathname })
