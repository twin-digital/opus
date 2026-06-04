/** Whether a charter's purpose has an achievable end-state, or runs forever. */
export type ArcShape = 'terminal' | 'perennial'

/** A covenant's founding purpose — the charter it is sworn to. */
export interface Charter {
  /** The purpose as a phrase: "to wake the drowned god beneath the reef". */
  purpose: string
  /** Terminal (an achievable end) or perennial (open-ended). */
  arcShape: ArcShape
  /** A short gloss on why the shape is what it is. */
  arcGloss: string
  /** The competence domains the purpose demands (a tag-profile on the Domain axis). */
  domains: string[]
}

/** A named member of the covenant's seed cast. */
export interface Seeker {
  name: string
  /** Optional epithet / role, e.g. "the diver", "Tidecaller". */
  epithet?: string
  /** Primary competence domain. */
  domain: string
  /** One or two temperament tags. */
  temperament: string[]
  /** Scarce narrative flavor bound to this seeker, e.g. "loves the deep water". */
  flavor?: string
}

/** A freshly generated covenant founding — the playable origin the renderer materializes. */
export interface Founding {
  /** The seed that produced this founding (so any founding is reproducible). */
  seed: number
  /** Covenant name, e.g. "The Tidebound". */
  name: string
  /** Theme key, e.g. "drowned". */
  theme: string
  /** Theme adjectives, e.g. ["sunken", "saline", "ancient"]. */
  themeTags: string[]
  /** A mood line. */
  mood: string
  /** The founding purpose. */
  charter: Charter
  /** Named seed cast (5–8) — the ones you will come to know and grieve. */
  cast: Seeker[]
  /** Rough total membership (named + anonymous mass). */
  membership: number
  /** One live tension (the contract requires ≥1). */
  tension: string
  /** One open thread — a question that carries attention forward (contract requires ≥1). */
  openThread: string
}
