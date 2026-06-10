import type { OperatorDetail, PipelineDetail, PipelineSummary } from '@twin-digital/grinbox-server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pipelines list + detail + Operator editor tests (jsdom + RTL, not e2e). The
 * data layer is mocked at the hook boundary (`@/lib/pipelines`); the router
 * primitives are stubbed so pages render synchronously without a RouterProvider.
 * Nothing touches the network. The `OperatorEditor` is exercised directly so its
 * client-side Zod validation + server-error surfacing are covered without the
 * full page.
 */

// --- Mocks ---------------------------------------------------------------

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => {
    const { to: _to, params: _params, ...rest } = props as Record<string, unknown>
    return <a {...rest}>{children}</a>
  },
  useParams: () => ({ pipelineId: '1' }),
  useNavigate: () => navigate,
}))

const usePipelineList = vi.fn<() => unknown>()
const usePipeline = vi.fn<(id: number) => unknown>()
const useCreatePipeline = vi.fn<() => unknown>()
const useUpdatePipeline = vi.fn<(id: number) => unknown>()
const useDeletePipeline = vi.fn<(id: number) => unknown>()
const useCreateOperator = vi.fn<(id: number) => unknown>()
const useUpdateOperator = vi.fn<(id: number) => unknown>()
const useSetOperatorEnabled = vi.fn<(id: number) => unknown>()
const useDeleteOperator = vi.fn<(id: number) => unknown>()
const useCredentials = vi.fn<(kind?: string) => unknown>()
const useOperatorPreview = vi.fn<(...args: unknown[]) => unknown>()

vi.mock('../../lib/pipelines.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pipelines.js')>('../../lib/pipelines.js')
  return {
    ...actual,
    usePipelineList: () => usePipelineList(),
    usePipeline: (id: number) => usePipeline(id),
    useCreatePipeline: () => useCreatePipeline(),
    useUpdatePipeline: (id: number) => useUpdatePipeline(id),
    useDeletePipeline: (id: number) => useDeletePipeline(id),
    useCreateOperator: (id: number) => useCreateOperator(id),
    useUpdateOperator: (id: number) => useUpdateOperator(id),
    useSetOperatorEnabled: (id: number) => useSetOperatorEnabled(id),
    useDeleteOperator: (id: number) => useDeleteOperator(id),
    useCredentials: (kind?: string) => useCredentials(kind),
    useOperatorPreview: (...args: unknown[]) => useOperatorPreview(...args),
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { PipelineApiError } from '../../lib/pipelines.js'
import { PipelineDetailPage } from './detail.js'
import { OperatorEditor } from './editors/operator-editor.js'
import { PipelinesListPage } from './list.js'

// --- Fixtures ------------------------------------------------------------

const pipelineA: PipelineSummary = {
  id: 1,
  name: 'Personal mail v2',
  description: 'Classify and notify on personal mail.',
  active_account_count: 2,
}
const pipelineB: PipelineSummary = {
  id: 2,
  name: 'Work triage',
  description: null,
  active_account_count: 0,
}

const llmOp: OperatorDetail = {
  id: 10,
  name: 'Classify',
  type_key: 'llm_tagger',
  enabled: true,
  group: 0,
  contract: {
    inputs: [],
    outputs: [
      { key: 'category', valueEnum: ['work', 'personal'] },
      { key: 'intent', valueEnum: ['ask', 'fyi'] },
    ],
    resources: [],
  },
  config: {
    model_id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    prompt_template: 'Classify this email.',
    outputs: [{ tag_key: 'category', value_enum: ['work', 'personal'] }],
  },
}
const urgencyOp: OperatorDetail = {
  id: 11,
  name: 'Urgency rules',
  type_key: 'rule_based_tagger',
  enabled: true,
  group: 1,
  contract: {
    inputs: [],
    outputs: [{ key: 'urgency', valueEnum: ['high', 'low'] }],
    resources: [],
  },
  config: {
    output_tag_key: 'urgency',
    output_value_enum: ['high', 'low'],
    rules: [],
    fallback: { output: 'low' },
  },
}
const vipOp: OperatorDetail = {
  id: 12,
  name: 'VIP rules',
  type_key: 'rule_based_tagger',
  enabled: false,
  group: 1,
  contract: {
    inputs: [],
    outputs: [{ key: 'is_vip', valueEnum: ['yes', 'no'] }],
    resources: [],
  },
  config: {
    output_tag_key: 'is_vip',
    output_value_enum: ['yes', 'no'],
    rules: [],
    fallback: { output: 'no' },
  },
}

const detail: PipelineDetail = {
  ...pipelineA,
  operators: [llmOp, urgencyOp, vipOp],
  tag_key_registry: [
    {
      key: 'category',
      producer_operator_id: 10,
      value_enum: ['work', 'personal'],
    },
    { key: 'urgency', producer_operator_id: 11, value_enum: ['high', 'low'] },
  ],
}

function queryStub<T>(data: T | undefined, overrides = {}) {
  return {
    data,
    isPending: data === undefined,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function mutationStub(overrides = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    ...overrides,
  }
}

function renderPage(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

// Tear down each render explicitly. The shared single-fork pool reuses one jsdom
// document across files; an open Radix overlay left at a test boundary can leak
// body-level side effects (a lingering `pointer-events:none` / `aria-hidden` and
// portal nodes), so we unmount deterministically and scrub those residues after
// every test to keep the next test — in this file or the next — pristine.
afterEach(() => {
  cleanup()
  document.body.style.pointerEvents = ''
  document.body.removeAttribute('aria-hidden')
  for (const el of Array.from(document.body.children)) {
    el.removeAttribute('aria-hidden')
    el.removeAttribute('data-aria-hidden')
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  useCreatePipeline.mockReturnValue(mutationStub())
  useUpdatePipeline.mockReturnValue(mutationStub())
  useDeletePipeline.mockReturnValue(mutationStub())
  useCreateOperator.mockReturnValue(mutationStub())
  useUpdateOperator.mockReturnValue(mutationStub())
  useSetOperatorEnabled.mockReturnValue(mutationStub())
  useDeleteOperator.mockReturnValue(mutationStub())
  // Default: no Pushover credentials (the Notify picker renders its empty state).
  useCredentials.mockReturnValue(queryStub([]))
  // Default preview: disabled/pending (no draft settled). Pane tests override.
  useOperatorPreview.mockReturnValue(queryStub(undefined))
})

// --- List ----------------------------------------------------------------

describe('PipelinesListPage', () => {
  it('renders a row per pipeline with the active-on count', () => {
    usePipelineList.mockReturnValue(queryStub([pipelineA, pipelineB]))
    renderPage(<PipelinesListPage />)
    expect(screen.getByText('Personal mail v2')).toBeInTheDocument()
    expect(screen.getByText('Work triage')).toBeInTheDocument()
    expect(screen.getByText('2 Accounts')).toBeInTheDocument()
    // The zero-account pipeline warns.
    expect(screen.getByText('0 Accounts')).toBeInTheDocument()
  })

  it('renders the empty-state CTA when there are no pipelines', () => {
    usePipelineList.mockReturnValue(queryStub([]))
    renderPage(<PipelinesListPage />)
    expect(screen.getByText('No Pipelines yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New Pipeline/i })).toBeInTheDocument()
  })

  it('shows a skeleton on first load', () => {
    usePipelineList.mockReturnValue(queryStub(undefined))
    const { container } = renderPage(<PipelinesListPage />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

// --- Detail --------------------------------------------------------------

describe('PipelineDetailPage', () => {
  it('renders operators in order with a parallel-group bracket', () => {
    usePipeline.mockReturnValue(queryStub(detail))
    renderPage(<PipelineDetailPage />)

    // Operators present in topo order.
    expect(screen.getByText('Classify')).toBeInTheDocument()
    expect(screen.getByText('Urgency rules')).toBeInTheDocument()
    expect(screen.getByText('VIP rules')).toBeInTheDocument()

    // The two group-1 (mutually independent) operators get the parallel caption.
    expect(screen.getByText(/Independent — runs in parallel/i)).toBeInTheDocument()

    // The disabled operator is badged.
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('renders the read-only tag-key registry', () => {
    usePipeline.mockReturnValue(queryStub(detail))
    renderPage(<PipelineDetailPage />)
    const registry = screen.getByText(/Tag-key registry/i).closest('section') as HTMLElement
    expect(within(registry).getByText('category')).toBeInTheDocument()
    expect(within(registry).getByText('urgency')).toBeInTheDocument()
  })

  it('toggles an operator via the enable/disable switch', () => {
    const setEnabled = mutationStub()
    useSetOperatorEnabled.mockReturnValue(setEnabled)
    usePipeline.mockReturnValue(queryStub(detail))
    renderPage(<PipelineDetailPage />)

    // The enabled LLM operator's switch disables it.
    fireEvent.click(screen.getByRole('switch', { name: /Disable Classify/i }))
    expect(setEnabled.mutate).toHaveBeenCalledWith({ operatorId: 10, enabled: false }, expect.anything())
  })

  it('lists registered Operator types in the Add Operator modal', async () => {
    usePipeline.mockReturnValue(queryStub(detail))
    renderPage(<PipelineDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add Operator/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('LLM Tagger')).toBeInTheDocument()
    expect(within(dialog).getByText('Rule-based Tagger')).toBeInTheDocument()
    expect(within(dialog).getByText('Notify')).toBeInTheDocument()
    expect(within(dialog).getByText('Apply Category')).toBeInTheDocument()
    expect(within(dialog).getByText('Digest delivery')).toBeInTheDocument()
  })
})

// --- Operator editor -----------------------------------------------------

describe('OperatorEditor', () => {
  function renderEditor(props: Partial<React.ComponentProps<typeof OperatorEditor>> = {}) {
    const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined)
    render(
      <OperatorEditor
        open
        onOpenChange={vi.fn()}
        mode='create'
        typeKey='rule_based_tagger'
        pipelineId={1}
        initialName=''
        onSave={onSave}
        {...props}
      />,
    )
    return { onSave }
  }

  it('renders the Rule-based editor fields', () => {
    renderEditor({ typeKey: 'rule_based_tagger' })
    expect(screen.getByLabelText('Output Tag key')).toBeInTheDocument()
    expect(screen.getByText('Output values')).toBeInTheDocument()
    expect(screen.getByText('Rules')).toBeInTheDocument()
    expect(screen.getByText(/Fallback \(default value\)/)).toBeInTheDocument()
  })

  it('renders the LLM editor fields', () => {
    renderEditor({ typeKey: 'llm_tagger' })
    expect(screen.getByLabelText('Prompt template')).toBeInTheDocument()
    expect(screen.getByText('Outputs')).toBeInTheDocument()
    expect(screen.getByLabelText('Model')).toBeInTheDocument()
  })

  it('shows the dirty-state footer once the name is edited', () => {
    renderEditor({ typeKey: 'apply_category' })
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Operator name'), {
      target: { value: 'Tag it' },
    })
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument()
  })

  it('rejects an invalid config client-side (Zod) before saving', async () => {
    // Fresh rule_based config has empty output_tag_key + empty enum values —
    // ruleBasedTaggerConfigSchema rejects these, so onSave never fires.
    const { onSave } = renderEditor({ typeKey: 'rule_based_tagger' })
    fireEvent.change(screen.getByLabelText('Operator name'), {
      target: { value: 'Urgency' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Couldn't save this Operator/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('surfaces a pipeline_validation_failed error and keeps the editor open', async () => {
    const onOpenChange = vi.fn()
    const onSave = vi
      .fn()
      .mockRejectedValue(
        new PipelineApiError('pipeline_validation_failed', 'Pipeline validation failed.', [
          'output key "urgency" is already produced by another Operator',
        ]),
      )
    // A valid apply_category config so client validation passes and the request
    // reaches onSave (which throws the server error).
    renderEditor({
      typeKey: 'apply_category',
      initialConfig: { category_template: 'Grinbox/News' },
      onSave,
      onOpenChange,
    })
    fireEvent.change(screen.getByLabelText('Operator name'), {
      target: { value: 'Categorize' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/already produced by another Operator/)).toBeInTheDocument()
    // Editor stays open — onOpenChange(false) is never called on a failed save.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('pre-populates a rule-based editor from an existing config (edit)', () => {
    renderEditor({
      mode: 'edit',
      typeKey: 'rule_based_tagger',
      initialName: 'Urgency rules',
      initialConfig: {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [{ match: 'subject ~ "URGENT"', output: 'high' }],
        fallback: { output: 'low' },
      },
    })
    expect(screen.getByLabelText('Output Tag key')).toHaveValue('urgency')
    // The saved rule renders with its match expression.
    expect(screen.getByDisplayValue('subject ~ "URGENT"')).toBeInTheDocument()
    // The seeded edit starts clean (no spurious unsaved-changes state).
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument()
  })

  it('pre-populates an LLM editor prompt from an existing config (edit)', () => {
    renderEditor({
      mode: 'edit',
      typeKey: 'llm_tagger',
      initialName: 'Classify',
      initialConfig: {
        model_id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
        prompt_template: 'Classify this email by topic.',
        outputs: [{ tag_key: 'topic', value_enum: ['work', 'personal'] }],
      },
    })
    expect(screen.getByLabelText('Prompt template')).toHaveValue('Classify this email by topic.')
    expect(screen.getByDisplayValue('topic')).toBeInTheDocument()
  })

  it('Notify editor lists pushover credentials from the hook', () => {
    useCredentials.mockReturnValue(
      queryStub([
        {
          id: 7,
          kind: 'pushover',
          account_id: null,
          created_at: 1_700_000_000,
          updated_at: null,
        },
      ]),
    )
    renderEditor({
      mode: 'edit',
      typeKey: 'notify',
      initialName: 'Push it',
      initialConfig: { message_template: 'hi', credentials_id: 7 },
    })
    // The numeric input is gone; a credential Select is shown with the chosen one.
    expect(screen.queryByPlaceholderText('Credential id')).not.toBeInTheDocument()
    expect(screen.getByText(/Pushover credential #7/)).toBeInTheDocument()
  })

  it('Notify editor shows an empty state when there are no credentials', () => {
    useCredentials.mockReturnValue(queryStub([]))
    renderEditor({
      typeKey: 'notify',
      initialConfig: { message_template: '', credentials_id: 0 },
    })
    expect(screen.getByText(/No Pushover Credentials yet/)).toBeInTheDocument()
  })

  // --- Action `when` gate -------------------------------------------------

  const credStub = () =>
    queryStub([
      {
        id: 7,
        kind: 'pushover',
        account_id: null,
        created_at: 1_700_000_000,
        updated_at: null,
      },
    ])

  it('renders the when-gate toggle off by default and reveals fields when enabled', () => {
    useCredentials.mockReturnValue(credStub())
    renderEditor({
      typeKey: 'notify',
      initialConfig: { message_template: 'hi', credentials_id: 7 },
    })
    // Gate starts off; no tag_key field yet.
    expect(screen.getByText('Always fires')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tag key')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByText('Only when a Tag matches')).toBeInTheDocument()
    expect(screen.getByLabelText('Tag key')).toBeInTheDocument()
    expect(screen.getByText('Fires when the Tag is one of')).toBeInTheDocument()
  })

  it('saves a valid Notify config with the when gate', async () => {
    useCredentials.mockReturnValue(credStub())
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderEditor({
      typeKey: 'notify',
      initialConfig: { message_template: 'hi', credentials_id: 7 },
      onSave,
    })
    fireEvent.change(screen.getByLabelText('Operator name'), {
      target: { value: 'Push it' },
    })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Tag key'), {
      target: { value: 'urgency' },
    })
    fireEvent.change(screen.getByLabelText('Value 1'), {
      target: { value: 'high' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })
    expect(onSave).toHaveBeenCalledWith({
      name: 'Push it',
      config: {
        message_template: 'hi',
        credentials_id: 7,
        when: { tag_key: 'urgency', equals: ['high'] },
      },
    })
  })

  it('rejects an enabled-but-incomplete when gate before saving', async () => {
    useCredentials.mockReturnValue(credStub())
    const { onSave } = renderEditor({
      typeKey: 'notify',
      initialConfig: { message_template: 'hi', credentials_id: 7 },
    })
    fireEvent.change(screen.getByLabelText('Operator name'), {
      target: { value: 'Push it' },
    })
    // Enable the gate but leave tag_key + the seeded blank value empty.
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('pre-populates the when gate from an existing Notify config (edit)', () => {
    useCredentials.mockReturnValue(credStub())
    renderEditor({
      mode: 'edit',
      typeKey: 'notify',
      initialName: 'Push high',
      initialConfig: {
        message_template: 'hi',
        credentials_id: 7,
        when: { tag_key: 'urgency', equals: ['high'] },
      },
    })
    expect(screen.getByText('Only when a Tag matches')).toBeInTheDocument()
    expect(screen.getByLabelText('Tag key')).toHaveValue('urgency')
    expect(screen.getByLabelText('Value 1')).toHaveValue('high')
    // A seeded edit with the gate already on starts clean.
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument()
  })

  it('Apply Category editor exposes the when gate and saves it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderEditor({
      typeKey: 'apply_category',
      initialConfig: { category_template: 'Grinbox/News' },
      onSave,
    })
    fireEvent.change(screen.getByLabelText('Operator name'), {
      target: { value: 'Categorize' },
    })
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Tag key'), {
      target: { value: 'category' },
    })
    fireEvent.change(screen.getByLabelText('Value 1'), {
      target: { value: 'news' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })
    expect(onSave).toHaveBeenCalledWith({
      name: 'Categorize',
      config: {
        category_template: 'Grinbox/News',
        when: { tag_key: 'category', equals: ['news'] },
      },
    })
  })
})
