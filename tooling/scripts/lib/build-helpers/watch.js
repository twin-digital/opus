import { getBuildStrategy } from './detect.js'

export const makeWatcher = async () => {
  const watchers = await getBuildStrategy()

  return {
    watch: () => Promise.all(watchers.map((watcher) => watcher.watch())),
  }
}
