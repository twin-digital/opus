import { collectViews } from '@thrashplay/wishem-renderer-pixi'

const sidecars = import.meta.glob('./views/*.view.json', { eager: true })
const modules = import.meta.glob(['./views/*.ts', '!./views/*.test.ts'], { eager: true })

/** The PixiJS views of the page. */
export const views = collectViews(sidecars, modules)
