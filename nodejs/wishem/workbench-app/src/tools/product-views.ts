import { collectViews, ViewCollectionError, type ViewTable } from '@thrashplay/wishem-renderer-react'

export interface ProductViews {
  views: ViewTable
  error?: string
}

export interface LoadProductViewsOptions {
  fetch?: typeof fetch
  /** Default: a dynamic `import()`. */
  load?: (url: string) => Promise<unknown>
}

const LIST_URL = '/@wishem/product-views.json'
const NOT_CORRECT = 'The views of the product are not correct.'

const empty = (): ViewTable => collectViews({}, {})
const failed = (): ProductViews => ({ views: empty(), error: NOT_CORRECT })

const fileName = (url: string): string => url.slice(url.lastIndexOf('/') + 1)

interface Pair {
  sidecar: string
  view: string
}

const pairsOf = (body: unknown): Pair[] | undefined => {
  const list = (body as { views?: unknown } | null)?.views
  if (!Array.isArray(list)) {
    return undefined
  }
  const pairs: Pair[] = []
  for (const item of list as unknown[]) {
    const { sidecar, view } = (item ?? {}) as Partial<Pair>
    if (typeof sidecar !== 'string' || typeof view !== 'string') {
      return undefined
    }
    pairs.push({ sidecar, view })
  }
  return pairs
}

/** Fetches the list of the views of the product, imports each file, and collects the views. A 404 gives an empty table. */
export const loadProductViews = async (options: LoadProductViewsOptions = {}): Promise<ProductViews> => {
  const { fetch: fetchList = (url) => fetch(url), load = (url) => import(/* @vite-ignore */ url) } = options
  try {
    const response = await fetchList(LIST_URL)
    if (response.status === 404) {
      return { views: empty() }
    }
    if (!response.ok) {
      console.error(`wishem: the list of the product views gave the status ${response.status}.`)
      return failed()
    }
    const pairs = pairsOf(await response.json())
    if (!pairs) {
      console.error('wishem: the list of the product views is not correct.')
      return failed()
    }
    const sidecars: Record<string, unknown> = {}
    const modules: Record<string, unknown> = {}
    for (const pair of pairs) {
      const name = fileName(pair.sidecar).replace(/\.view\.json$/, '')
      sidecars[`./${name}.view.json`] = await load(pair.sidecar)
      modules[`./${name}.tsx`] = await load(pair.view)
    }
    return { views: collectViews(sidecars, modules) }
  } catch (error) {
    console.error(
      error instanceof ViewCollectionError ? error.message : `wishem: the product views failed. ${String(error)}`,
    )
    return failed()
  }
}
