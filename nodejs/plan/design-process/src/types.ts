/**
 * One validation result; `claims` names the requirement/decision ids the rule enforces.
 * A `finding` (the default) gates the merge and sets the nonzero exit; a `report` gates
 * nothing repo-wide (d-8y5vmff8). `product` names the product the result concerns, where one does.
 */
export interface Finding {
  rule: string
  claims: string[]
  path?: string
  message: string
  severity?: 'finding' | 'report'
  product?: string
}

/** A component subtree reference: one component id, or a list of them (d-rplsevuk). */
export type Scope = string | string[]

export interface RequirementEntry {
  id: string
  title?: string
  statement: string
  /** Non-normative prose beside the statement; binds nothing and is never citable (d-oqiw2ggm). */
  commentary?: string
  scope?: Scope
  rationale?: string
  verification?: ({ do: string } | { verify: string })[]
  facets?: string | string[]
  informed_by?: string[]
  /** `requirement@1` sources spell the succession `amends:` (d-4i5k9nsi). */
  amends?: string
  supersedes?: string
}

/** One ordered branch of a decision's `cases:`; the first matching case governs (d-qv81x173). */
export type DecisionCase = { when: string; then: string } | { otherwise: string }

export interface DecisionEntry {
  id: string
  title?: string
  statement: string
  status: 'proposed' | 'accepted' | 'tolerated' | 'delegated' | 'rejected' | 'deferred'
  /** `decision@3` spells the rejection's reason `reason:` (d-4i5k9nsi). */
  reason?: string
  rejection_reason?: string
  pinned?: false | { reason: 'data-format' | 'public-api' | 'other'; notes?: string }
  because?: string[]
  revisit_when?: string[]
  supersedes?: string
  commentary?: string
  cases?: DecisionCase[]
  scope?: Scope
  facets?: string | string[]
}

export interface QuestionEntry {
  id: string
  question: string
  answer: 'fact' | 'requirement' | 'decision'
  facets?: string | string[]
}

export interface ModelEntry {
  name: string
  schema?: string
  /** A surface reference; `requirements@1` sources spell the same key `api:` (d-pe4j25wq). */
  surface?: string
  api?: string
  description?: string
  /** `requirements@3` retires with a reason; earlier dialects keep bound/unbound (d-vax1016k). */
  status?: 'bound' | 'unbound' | 'retired'
  reason?: string
}

export interface PresetEntry {
  name: string
  version?: number
  /** `requirements@3` spells the statuses applied/retired; earlier dialects adopted/dropped (d-cizeaklk). */
  status?: 'adopted' | 'dropped' | 'applied' | 'retired'
  reason?: string
  scope?: Scope
}

/** One component of the product's decomposition, folding by id (d-rk99dwty, d-9qbjzflc). */
export interface ComponentEntry {
  id: string
  description: string
  /** The containing component; a child of the product root when absent (d-cgr6q2j1). */
  parent?: string
  status?: 'active' | 'retired'
  reason?: string
  /** The component existing scope references resolve through (d-cc3nilxq). */
  superseded_by?: string
}

/** One term of the product's glossary, folding by id; the definition binds (d-amueiyj2, d-0435v8sr). */
export interface TermEntry {
  id: string
  definition: string
  /** The natural written form, where the slug cannot carry it (d-bgoclt56). */
  display?: string
  scope?: Scope
  status?: 'active' | 'retired'
  reason?: string
  superseded_by?: string
}

export interface RetireEntry {
  id: string
  reason: string
}

export interface RequirementsSource {
  version: string
  requirements?: RequirementEntry[]
  model?: ModelEntry[]
  presets?: PresetEntry[]
  components?: ComponentEntry[]
  terms?: TermEntry[]
  retires?: RetireEntry[]
}

export interface DecisionsSource {
  version: string
  decisions?: DecisionEntry[]
  retires?: RetireEntry[]
}

export interface QuestionsSource {
  version: string
  questions?: QuestionEntry[]
}

export interface CoverageEntry {
  claim: string
  covered_by: { kind: string; ref?: string | string[]; note?: string }[]
}

export interface ImplementationRecord {
  version: string
  product: string
  target: number
  built_at?: string
  packages: { path: string; version: string }[]
  /** Optional in the type because a not-yet-valid file may omit it; the schema requires it. */
  coverage?: CoverageEntry[]
}

export interface ProductDeclaration {
  version: string
  kind: string
  /** `product@2` retires the product in its own declaration (d-i849afta). */
  status?: 'active' | 'retired'
  reason?: string
  facets?: { id: string; description: string }[]
  packages?: { path: string; kind: string; repo?: string; component?: Scope }[]
}
