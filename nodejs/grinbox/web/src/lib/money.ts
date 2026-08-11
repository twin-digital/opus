import type { TagKeyRegistryEntry } from '@grinbox/server'
import { formatMoneyDisplay } from '@grinbox/shared'
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { fetchPipeline, pipelineKey } from './pipelines'

/**
 * The interface shows money as the digest does (d-u4gpx6ke): wherever a Tag's
 * value is shown, it renders in display form when the producing Pipeline's
 * enabled Operators type the key as an extracted money output (d-m6ingqyv).
 * Which keys those are is read off each Pipeline's `tag_key_registry`
 * (`value_type === 'money'`); the rendering itself is `@grinbox/shared`'s
 * `formatMoneyDisplay`, the same function the digest uses, so the two surfaces
 * cannot drift (d-oc073wsp, d-b1ntd8go).
 *
 * What the user *types* — a threshold in a digest highlight — stays in the
 * stored form the wire already fixes; only read surfaces go through this.
 */

/** The keys a Pipeline's enabled Operators declare as extracted money outputs. */
export function moneyKeysFromRegistry(registry: readonly TagKeyRegistryEntry[]): ReadonlySet<string> {
  return new Set(registry.filter((entry) => entry.value_type === 'money').map((entry) => entry.key))
}

/**
 * Money-typed Tag keys per Pipeline, for the Pipelines whose Tags are on
 * screen. Details load through the same query key the Pipeline page uses, so
 * the cache is shared; a Pipeline whose detail has not loaded yet contributes
 * no entry, and its Tags render verbatim until it does.
 */
export function useMoneyKeysByPipeline(pipelineIds: readonly number[]): ReadonlyMap<number, ReadonlySet<string>> {
  const ids = useMemo(() => [...new Set(pipelineIds)].sort((a, b) => a - b), [pipelineIds])
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: pipelineKey(id),
      queryFn: () => fetchPipeline(id),
    })),
  })
  // Rebuilt per render — the sets are tiny and the map is only read in render.
  const map = new Map<number, ReadonlySet<string>>()
  results.forEach((result, i) => {
    if (result.data !== undefined) {
      map.set(ids[i], moneyKeysFromRegistry(result.data.tag_key_registry))
    }
  })
  return map
}

/**
 * A Tag value as the interface shows it: the display form for a money-typed
 * key whose stored value is money, verbatim otherwise (d-m6ingqyv). The
 * stored → display rendering is `@grinbox/shared`'s — an unknown-symbol
 * currency renders its ISO code before the amount ("CHF 1,234.56").
 */
export function displayTagValue(key: string, value: string, moneyKeys: ReadonlySet<string> | undefined): string {
  if (moneyKeys?.has(key) !== true) {
    return value
  }
  return formatMoneyDisplay(value) ?? value
}
