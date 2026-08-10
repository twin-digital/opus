/**
 * `/api/models` — the Bedrock models the daemon can invoke, for the UI's model
 * pickers (LLM Tagger `model_id`, Digest `summary_model_id`). Derived from the
 * server's model map (`resources/bedrock.ts` MODEL_OPTIONS), so the pickers
 * track the daemon's supported set with no client-side copy of the list.
 */

import { Hono } from 'hono'
import { MODEL_OPTIONS } from '../../resources/bedrock.js'

export type { ModelOption } from '../../resources/bedrock.js'

export function createModelsRoutes() {
  return new Hono().get('/', (c) => c.json({ models: MODEL_OPTIONS }))
}
