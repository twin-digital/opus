/**
 * `/api/models` — the closed set of models an operator may name (d-kv9ipb56),
 * for the interface's pickers. The set is `@grinbox/shared`'s `MODELS`, the same
 * one `modelIdSchema` refuses a save against, so a picker cannot offer an id a
 * save would reject.
 */

import { MODELS } from '@grinbox/shared'
import { Hono } from 'hono'

export type { ModelOption } from '@grinbox/shared'

export function createModelsRoutes() {
  return new Hono().get('/', (c) => c.json({ models: MODELS }))
}
