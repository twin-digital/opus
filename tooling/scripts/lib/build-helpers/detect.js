import * as assets from './builders/assets.js'
import * as tsc from './builders/tsc.js'
import * as tsdown from './builders/tsdown.js'

export const getBuildStrategy = async () => {
  const builders = []

  const hasAssets = await assets.supports()
  const tsdownSupports = await tsdown.supports()
  const tscSupports = await tsc.supports()

  if (tsdownSupports) {
    builders.push(tsdown)
  } else if (tscSupports) {
    builders.push(tsc)
  }

  if (hasAssets) {
    builders.push(assets)
  }

  return builders
}
