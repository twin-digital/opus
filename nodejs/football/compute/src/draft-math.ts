/**
 * Snake-draft pick arithmetic and make-it-back odds. Pure functions — the live board calls
 * these every poll.
 */
import type { MarketData } from '@twin-digital/football-data'

import { marketAdp, roomAdp } from './room.js'

/** Overall pick numbers for a draft slot (1-based) in a snake draft. Slot 11 of 12 → 11, 14, 35, 38, … */
export const overallPicksForSlot = (slot: number, teams: number, rounds: number): number[] => {
  const picks: number[] = []
  for (let round = 1; round <= rounds; round += 1) {
    const inRound = round % 2 === 1 ? slot : teams - slot + 1
    picks.push((round - 1) * teams + inRound)
  }
  return picks
}

/** The next `count` of the slot's picks at or after `currentOverall` (the pick now on the clock). */
export const upcomingPicksForSlot = (slot: number, teams: number, currentOverall: number, count = 2): number[] => {
  const rounds = Math.ceil(currentOverall / teams) + count + 1
  return overallPicksForSlot(slot, teams, rounds)
    .filter((pick) => pick >= currentOverall)
    .slice(0, count)
}

/** Standard normal CDF via the Abramowitz–Stegun erf approximation (|error| < 1.5e-7). */
export const normalCdf = (x: number, mean: number, sigma: number): number => {
  const z = (x - mean) / (sigma * Math.SQRT2)
  const t = 1 / (1 + 0.3275911 * Math.abs(z))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-z * z)
  return 0.5 * (1 + (z < 0 ? -erf : erf))
}

/**
 * σ of the pick a player goes at: FantasyPros rank_std where the experts disagree measurably,
 * else a crude position-in-draft scaling (later picks are less certain).
 */
export const sigmaForPick = (adp: number, rankStd: number | null | undefined): number =>
  rankStd !== null && rankStd !== undefined && rankStd > 0 ? Math.max(rankStd, 2) : 0.15 * adp + 2

/** P(still on the board when pick `overall` starts), modeling pick-taken as Normal(adp, σ). */
export const availabilityAtPick = (adp: number, sigma: number, overall: number): number =>
  1 - normalCdf(overall - 0.5, adp, sigma)

/**
 * P(available at a future pick | available now): survival at the target pick conditioned on
 * having survived to the pick currently on the clock.
 */
export const makeItBackOdds = (adp: number, sigma: number, currentOverall: number, targetOverall: number): number => {
  const now = availabilityAtPick(adp, sigma, currentOverall)
  if (now <= 0) {
    return 0
  }
  return Math.min(1, availabilityAtPick(adp, sigma, targetOverall) / now)
}

/** Which board a survival estimate reads prices from: this room's (ESPN-led) or the market's. */
export type AdpSource = 'room' | 'market'

export interface SurvivalOptions {
  /** Planning functions default to 'room' — the odds should describe this draft, not drafts in general. */
  adpSource?: AdpSource
}

/** The ADP a planning function should model a player's exit around, under the chosen source. */
export const planningAdp = (market: MarketData, options: SurvivalOptions = {}): number | null =>
  (options.adpSource ?? 'room') === 'room' ? (roomAdp(market) ?? marketAdp(market)) : marketAdp(market)

/** P(still on the board at pick `overall`) under the chosen ADP source; null without an ADP. */
export const survivalAtPick = (market: MarketData, overall: number, options: SurvivalOptions = {}): number | null => {
  const adp = planningAdp(market, options)
  if (adp === null) {
    return null
  }
  return availabilityAtPick(adp, sigmaForPick(adp, market.ecr?.stdDev), overall)
}

/** Make-it-back odds under the chosen ADP source; null without an ADP. */
export const makeItBackOddsForMarket = (
  market: MarketData,
  currentOverall: number,
  targetOverall: number,
  options: SurvivalOptions = {},
): number | null => {
  const adp = planningAdp(market, options)
  if (adp === null) {
    return null
  }
  return makeItBackOdds(adp, sigmaForPick(adp, market.ecr?.stdDev), currentOverall, targetOverall)
}
