import type { RuleBasedTaggerConfig } from '@twin-digital/grinbox-shared'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rule-based Tagger live-preview pane (ui-design.md §4). The preview hook
 * (`useOperatorPreview`) is mocked at the `@/lib/pipelines` boundary so nothing
 * touches the network; the pane is driven through its query states. The debounce
 * is set to 0ms per render so the draft settles synchronously and `findBy` never
 * fights a pending timer (the production default is 500ms).
 */

const useOperatorPreview = vi.fn<(...args: unknown[]) => unknown>()

vi.mock('../../../lib/pipelines.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/pipelines.js')>('../../../lib/pipelines.js')
  return {
    ...actual,
    useOperatorPreview: (...args: unknown[]) => useOperatorPreview(...args),
  }
})

import { PipelineApiError } from '../../../lib/pipelines.js'
import { type RuleBasedDraft, RuleBasedPreview } from './rule-based-editor.js'

// A complete, schema-valid draft — the pane's gate passes and it "POSTs".
const validDraft: RuleBasedDraft = {
  output_tag_key: 'urgency',
  output_value_enum: ['high', 'low'],
  rules: [{ match: 'subject ~ "URGENT"', output: 'high' }],
  fallback: { output: 'low' },
}

// An incomplete draft — no Output Tag key / no values — fails the client schema.
const incompleteDraft: RuleBasedDraft = {
  output_tag_key: '',
  output_value_enum: [],
  rules: [],
  fallback: { output: '' },
}

function queryStub<T>(data: T | undefined, overrides = {}) {
  return {
    data,
    isPending: data === undefined,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderEditor(draft: RuleBasedDraft) {
  return render(<RuleBasedPreview draft={draft} pipelineId={7} debounceMs={0} />)
}

/** The preview `<aside>`, so assertions don't collide with the editor's own
 * rule/fallback Selects (which also render the enum values). */
function pane(): HTMLElement {
  return screen.getByText('Live preview').closest('aside') as HTMLElement
}

afterEach(() => {
  vi.clearAllMocks()
})

beforeEach(() => {
  useOperatorPreview.mockReturnValue(queryStub(undefined))
})

describe('RuleBasedPreview live preview', () => {
  it('renders the summary and changed rows with current → draft markers', async () => {
    useOperatorPreview.mockReturnValue(
      queryStub({
        results: [
          {
            message_id: 1,
            from: 'Alice <alice@example.com>',
            subject: 'URGENT: server down',
            snippet: null,
            received_at: null,
            current_value: 'low',
            draft_value: 'high',
            changed: true,
          },
          {
            message_id: 2,
            from: 'Bob <bob@example.com>',
            subject: 'lunch?',
            snippet: null,
            received_at: null,
            current_value: 'low',
            draft_value: 'low',
            changed: false,
          },
        ],
        changed_count: 1,
        total_evaluated: 2,
      }),
    )
    renderEditor(validDraft)

    // Summary: N of M.
    expect(await screen.findByText('1 of 2')).toBeInTheDocument()
    const p = within(pane())
    // Changed row shown with its display name + subject.
    expect(p.getByText('Alice')).toBeInTheDocument()
    expect(p.getByText('URGENT: server down')).toBeInTheDocument()
    // Diff marker: current → draft.
    expect(p.getByText('low')).toBeInTheDocument()
    expect(p.getByText('high')).toBeInTheDocument()
    // The unchanged row (Bob) is not listed as a change.
    expect(p.queryByText('Bob')).not.toBeInTheDocument()
    expect(p.queryByText('lunch?')).not.toBeInTheDocument()
  })

  it('renders (none) for a null current_value', async () => {
    useOperatorPreview.mockReturnValue(
      queryStub({
        results: [
          {
            message_id: 3,
            from: 'Carol <carol@example.com>',
            subject: 'new key',
            snippet: null,
            received_at: null,
            current_value: null,
            draft_value: 'high',
            changed: true,
          },
        ],
        changed_count: 1,
        total_evaluated: 1,
      }),
    )
    renderEditor(validDraft)
    expect(await screen.findByText('(none)')).toBeInTheDocument()
    expect(within(pane()).getByText('high')).toBeInTheDocument()
  })

  it('shows the complete-the-rule prompt and issues no request for an incomplete draft', () => {
    renderEditor(incompleteDraft)
    expect(screen.getByText(/Complete the rule to preview/i)).toBeInTheDocument()
    // The hook is rendered but disabled with a null config — never an enabled query.
    expect(useOperatorPreview).toHaveBeenCalled()
    for (const call of useOperatorPreview.mock.calls) {
      // (pipelineId, config, limit?) — config must be null while invalid.
      expect(call[1]).toBeNull()
    }
  })

  it('surfaces an invalid_match_expression error inline', async () => {
    useOperatorPreview.mockReturnValue(
      queryStub(undefined, {
        isPending: false,
        isError: true,
        error: new PipelineApiError('invalid_match_expression', 'Unknown function "contians" in match expression'),
      }),
    )
    renderEditor(validDraft)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Unknown function "contians"/)
  })

  it('shows the empty state when total_evaluated is 0', async () => {
    useOperatorPreview.mockReturnValue(queryStub({ results: [], changed_count: 0, total_evaluated: 0 }))
    renderEditor(validDraft)
    expect(await screen.findByText(/No recent messages to preview against/i)).toBeInTheDocument()
  })

  it('shows the no-change state when changed_count is 0', async () => {
    useOperatorPreview.mockReturnValue(
      queryStub({
        results: [
          {
            message_id: 4,
            from: 'Dan <dan@example.com>',
            subject: 'fyi',
            snippet: null,
            received_at: null,
            current_value: 'low',
            draft_value: 'low',
            changed: false,
          },
        ],
        changed_count: 0,
        total_evaluated: 1,
      }),
    )
    renderEditor(validDraft)
    expect(await screen.findByText(/No changes — the draft produces the same values/i)).toBeInTheDocument()
  })
})
