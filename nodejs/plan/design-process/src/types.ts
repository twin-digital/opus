/** One validation failure; `claims` names the requirement/decision ids the rule enforces. */
export interface Finding {
  rule: string
  claims: string[]
  path?: string
  message: string
}

export interface RequirementEntry {
  id: string
  title?: string
  statement: string
  rationale?: string
  verification?: ({ do: string } | { verify: string })[]
  facets?: string | string[]
  informed_by?: string[]
  amends?: string
}

export interface DecisionEntry {
  id: string
  title?: string
  statement: string
  status: 'proposed' | 'accepted' | 'tolerated' | 'delegated' | 'rejected' | 'deferred'
  rejection_reason?: string
  pinned?: false | { reason: 'data-format' | 'public-api' | 'other'; notes?: string }
  because?: string[]
  revisit_when?: string[]
  supersedes?: string
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
  api?: string
  description?: string
  status?: 'bound' | 'unbound'
}

export interface PresetEntry {
  name: string
  version?: number
  status?: 'adopted' | 'dropped'
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
  facets?: { id: string; description: string }[]
  packages?: { path: string; kind: string; repo?: string }[]
}
