import { collectViews } from '@thrashplay/wishem-renderer-react'

/** Collects the sidecars and the view files of the `views` folder. Throws a `ViewCollectionError` when a sidecar is not correct. */
export const collectAppViews = () =>
  collectViews(
    import.meta.glob('./views/*.view.json', { eager: true }),
    import.meta.glob(['./views/*.tsx', '!./views/*.test.tsx'], { eager: true }),
  )
