import { describe, expect, it } from 'vitest'
import { blankConfigFor } from './operator-types.js'

/**
 * Blank-config seeding invariants. The model pickers fetch their options from
 * `GET /api/models` (the daemon's model map is the single source of truth);
 * the server's models route test pins that every offered id resolves to an
 * inference profile.
 */

describe('blankConfigFor', () => {
  it('seeds the blank LLM Tagger with no model id (dirty-invalid until picked)', () => {
    // The web carries no copy of any daemon model id; the User picks one from
    // the fetched options, and the schema's `min(1)` blocks Save until then.
    const tagger = blankConfigFor('llm_tagger') as { model_id: string }
    expect(tagger.model_id).toBe('')
  })

  it('seeds the blank Digest with no prose model', () => {
    // The blank Digest config declares no prose model — the composition makes
    // zero model calls until a section opts into an LLM prose block.
    const digest = blankConfigFor('digest_delivery') as {
      summary_model_id: string | null
    }
    expect(digest.summary_model_id).toBeNull()
  })
})
