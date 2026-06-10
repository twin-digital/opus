import { describe, expect, it } from 'vitest'
import { MODEL_OPTIONS, blankConfigFor } from './operator-types.js'

/**
 * The model pickers must offer only ids the daemon can map. The single source
 * of truth is the server's MODEL_INFERENCE_PROFILES (packages/server/src/
 * resources/bedrock.ts); the two supported ids are hardcoded here rather than
 * imported across packages (no cross-package dependency just for this guard).
 * If the server's supported set changes, update this set and MODEL_OPTIONS
 * together. A server-side test asserts these same ids resolve.
 */
const SUPPORTED_MODEL_IDS = new Set([
  'anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
])

describe('MODEL_OPTIONS', () => {
  it('offers exactly the two supported Bedrock model ids', () => {
    const ids = MODEL_OPTIONS.map((o) => o.id)
    expect(new Set(ids)).toEqual(SUPPORTED_MODEL_IDS)
  })

  it('every offered model id is in the supported set', () => {
    for (const opt of MODEL_OPTIONS) {
      expect(SUPPORTED_MODEL_IDS.has(opt.id)).toBe(true)
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })

  it('the blank LLM Tagger / Digest configs seed supported model ids', () => {
    const tagger = blankConfigFor('llm_tagger') as { model_id: string }
    const digest = blankConfigFor('digest_delivery') as { model_id: string }
    expect(SUPPORTED_MODEL_IDS.has(tagger.model_id)).toBe(true)
    expect(SUPPORTED_MODEL_IDS.has(digest.model_id)).toBe(true)
  })
})
