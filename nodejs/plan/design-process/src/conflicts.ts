import { parse } from 'yaml'

import { collectIds } from './ids.js'

import type { Fold } from './fold.js'
import type { FileTree } from './tree.js'
import type { DecisionsSource, Finding, RequirementsSource } from './types.js'

const CLAIM = ['r-0701ctqx']

const SOURCE_PATH = /^products\/([^/]+)\/increments\/([^/]+)\/(requirements|decisions)\.ya?ml$/

/** One increment directory on a draft branch — a wip directory, otherwise slug-named or numbered. */
export interface LandingIncrement {
  dir: string
  /** The number the directory name carries, when it is a zero-padded number. */
  number?: number
  requirements?: { path: string; data: RequirementsSource }
  decisions?: { path: string; data: DecisionsSource }
}

/**
 * A product's increment directories in `tree`, unnumbered ones included — a draft increment at its
 * `wip-<NNN>-<slug>` directory (`d-x0q4xgd8`) among them.
 */
export const loadLandingIncrements = (tree: FileTree, productId: string): LandingIncrement[] => {
  const byDir = new Map<string, LandingIncrement>()
  for (const path of tree.paths()) {
    const match = SOURCE_PATH.exec(path)
    if (match?.[1] !== productId) {
      continue
    }
    const [, , dir, kind] = match as unknown as [string, string, string, 'requirements' | 'decisions']
    let increment = byDir.get(dir)
    if (!increment) {
      increment = { dir, number: /^\d{3,}$/.test(dir) ? Number(dir) : undefined }
      byDir.set(dir, increment)
    }
    let data: unknown
    try {
      data = parse(tree.read(path))
    } catch {
      continue
    }
    increment[kind] = { path, data: data as never }
  }
  return [...byDir.values()].sort((a, b) => a.dir.localeCompare(b.dir))
}

/**
 * The rulings a landing would introduce: every increment directory that carries no published
 * number — a wip directory among them — or is numbered above the head fold.
 */
export const landingIncrements = (tree: FileTree, productId: string, headAt: number): LandingIncrement[] =>
  loadLandingIncrements(tree, productId).filter(
    (increment) => increment.number === undefined || increment.number > headAt,
  )

/**
 * Overlapping or conflicting rulings between a draft and the fold at head: an id the head
 * already declares, and a closure aimed at an entry head has already closed. Semantic overlap —
 * two drafts ruling the same choice under different ids — is the owner's read, not a finding.
 */
export const findLandingConflicts = (
  draft: FileTree,
  head: { tree: FileTree; fold: Fold },
  productId: string,
): Finding[] => {
  const findings: Finding[] = []
  const takenAtHead = collectIds(head.tree)
  const inForce = new Set<string>([...head.fold.requirements.keys(), ...head.fold.decisions.keys()])

  for (const increment of landingIncrements(draft, productId, head.fold.at)) {
    const declared: { id: string; path: string }[] = []
    const closures: { path: string; verb: string; target: string }[] = []

    const requirements = increment.requirements
    if (requirements !== undefined) {
      const { path } = requirements
      for (const entry of requirements.data.requirements ?? []) {
        declared.push({ id: entry.id, path })
        if (entry.amends !== undefined) {
          closures.push({ path, verb: `${entry.id} amends`, target: entry.amends })
        }
      }
      for (const retirement of requirements.data.retires ?? []) {
        closures.push({ path, verb: 'retires', target: retirement.id })
      }
    }

    const decisions = increment.decisions
    if (decisions !== undefined) {
      const { path } = decisions
      for (const entry of decisions.data.decisions ?? []) {
        declared.push({ id: entry.id, path })
        if (entry.supersedes !== undefined) {
          closures.push({ path, verb: `${entry.id} supersedes`, target: entry.supersedes })
        }
      }
      for (const retirement of decisions.data.retires ?? []) {
        closures.push({ path, verb: 'retires', target: retirement.id })
      }
    }

    for (const entry of declared) {
      if (takenAtHead.has(entry.id)) {
        findings.push({
          rule: 'landing-duplicate-id',
          claims: CLAIM,
          path: entry.path,
          message: `${entry.id} is already declared at head`,
        })
      }
    }
    for (const closure of closures) {
      if (!inForce.has(closure.target)) {
        findings.push({
          rule: 'landing-already-closed',
          claims: CLAIM,
          path: closure.path,
          message: `${closure.verb} ${closure.target}, which is not in force at head`,
        })
      }
    }
  }

  return findings
}
