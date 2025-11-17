import type { ModelApiAdapter } from './inference-api.js'
import { adapter as titanTextAdapter } from './models/amazon/titan-text.js'
import { adapter as claudeAdapter } from './models/anthropic/claude.js'

const modelAdapters = [
  {
    adapter: titanTextAdapter,
    match: /^amazon\.titan-text-.*/,
  },
  {
    adapter: claudeAdapter,
    match: /^anthropic\..*/,
  },
]

export const getModelAdapter = (
  modelId: string,
): ModelApiAdapter | undefined => {
  const matched = modelAdapters.find((entry) => entry.match.test(modelId))
  return matched?.adapter
}
