import { collectViews } from './renderer/index.js'

/** Collects the files of the `views` folder. Throws a `ViewCollectionError` when a file is not correct. */
export const collectAppViews = () =>
  collectViews(import.meta.glob(['./views/*.tsx', '!./views/*.test.tsx'], { eager: true }))
