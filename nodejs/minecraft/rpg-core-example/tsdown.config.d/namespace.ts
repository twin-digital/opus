// Sorts after minecraft-pack.ts, so this call wins. The generated fragment cannot express a
// namespace, which vendoring requires; everything else is still the kit's.
import { packBuild } from '@twin-digital/mc-dev-kit/build'

export default packBuild({ packageDir: new URL('..', import.meta.url).pathname, namespace: true })
