import { makeAutoObservable } from 'mobx'
import { type D6Result, resolveCheckResult, rollCheck } from '../core/checks.js'
import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import { fromTimestamp, toTimestamp } from '../date-time/math.js'
import type { GameDateTime } from '../date-time/model.js'
import { DiceRoll } from '@dice-roller/rpg-dice-roller'
import { EncounterRules } from '../core/encounters.js'

export type EncounterSideName = 'npcs' | 'players'
export type EncounterPhase = 'new' | 'awareness-determined' | 'surprise-and-distance-set' | 'initiative-rolled'

interface Awareness {
  readonly npcs: boolean
  readonly players: boolean
}

interface Initiative {
  /**
   * Initiative result for the NPCs. Will be a number, or one of the following special values:
   *
   * - automatic: If this side won initiative because the other was surprised
   * - surprised: If this side lost initiative due to being the only surprised side
   */
  readonly npcs: number | 'automatic' | 'surprised'

  /**
   * Initiative result for the players. Will be a number, or one of the following special values:
   *
   * - automatic: If this side won initiative because the other was surprised
   * - surprised: If this side lost initiative due to being the only surprised side
   */
  readonly players: number | 'automatic' | 'surprised'
}

interface SideSurpriseOutcome {
  /**
   * The X-in-6 chance this side is surprised.
   */
  readonly chance: D6Result

  /**
   * The result of this side's surprise roll.
   */
  readonly roll: number

  /**
   * Whether this side is surprised or not.
   */
  readonly surprised: boolean
}

interface Surprise {
  /**
   * Outcome of the surprise checks for the NPCs. Will be `null` if this side cannot be surprised. (Due to traits, being
   * aware at the start of the encounter, etc.)
   */
  readonly npcs: SideSurpriseOutcome | null

  /**
   * Outcome of the surprise checks for the Players. Will be `null` if this side cannot be surprised. (Due to traits,
   * being aware at the start of the encounter, etc.)
   */
  readonly players: SideSurpriseOutcome | null
}

interface DistanceRange {
  /**
   * Maximum possible encounter distance, in feet.
   */
  max: number

  /**
   * Minimum possible encounter distance, in feet.
   */
  min: number
}

interface BaseEncounter {
  /**
   * Details of which side(s) are aware of the other.
   */
  readonly awareness?: Awareness | undefined

  /**
   * Distance at which the encounter begins, in feet.
   */
  readonly distance?: number | undefined

  /**
   * Possible range at which the encounter could have taken place.
   */
  readonly distanceRange?: DistanceRange

  /**
   * Initiative rolls for each side.
   */
  readonly initiative?: Initiative | undefined

  /**
   * Current phase of the encounter:
   *
   * - new: Encounter called for, but not initiated
   * - awareness-determined: Which side(s) are aware of the other, if any, is known
   * - surprise-determined: Which side(s) are surprised, if any, is known
   * - distance-set: Encounter distance has been determined
   * - initiatve-rolled: Initiative has been rolled for both sides
   */
  readonly phase: EncounterPhase

  /**
   * Surprise details for each side.
   */
  readonly surprise?: Surprise | undefined

  /**
   * In-game time at which the encounter occurred. All encounters last one turn.
   */
  readonly timestamp: GameDateTime
}

interface NewEncounter extends BaseEncounter {
  readonly awareness: undefined
  readonly distance: undefined
  readonly distanceRange: undefined
  readonly initiative: undefined
  readonly phase: 'new'
  readonly surprise: undefined
}

interface AwarenessDeterminedEncounter extends BaseEncounter {
  readonly awareness: Awareness
  readonly distance: undefined
  readonly distanceRange: undefined
  readonly initiative: undefined
  readonly phase: 'awareness-determined'
  readonly surprise: undefined
}

interface SurpriseAndDistanceSetEncounter extends BaseEncounter {
  readonly awareness: Awareness
  readonly distance: number
  readonly distanceRange: DistanceRange
  readonly initiative: undefined
  readonly phase: 'surprise-and-distance-set'
  readonly surprise: Surprise
}

interface InitiativeRolledEncounter extends BaseEncounter {
  readonly awareness: Awareness
  readonly distance: number
  readonly distanceRange: DistanceRange
  readonly initiative: Initiative
  readonly phase: 'initiative-rolled'
  readonly surprise: Surprise
}

/**
 * Represents the various phases an encounter can be in during its lifecycle.
 * This is an immutable snapshot of the encounter's current state.
 */
export type EncounterSnapshot =
  | NewEncounter
  | AwarenessDeterminedEncounter
  | SurpriseAndDistanceSetEncounter
  | InitiativeRolledEncounter

export type EncounterJson = Omit<EncounterSnapshot, 'phase' | 'timestamp'> & {
  environment?: 'dungeon' | 'outdoors'
  timestamp: number
}

export class Encounter {
  private _awareness?: Awareness
  private _distance?: number
  private _distanceRange?: DistanceRange
  private _environment: 'dungeon' | 'outdoors'
  private _initiative?: Initiative
  private _surprise?: Surprise
  private _timestamp: GameDateTime

  public constructor(environment: 'dungeon' | 'outdoors', time?: GameDateTime) {
    this._environment = environment
    this._timestamp = time ?? DEFAULT_DATE_TIME
    makeAutoObservable(this)
  }

  /**
   * Given the encounter's environment and surprise status, return the dice notation used to calculate encounter
   * distance.
   */
  private _getEncounterDistanceDice() {
    // encounter distance depends on surprise.. if we haven't rolled it yet, assume nobody is surprised
    const npcsSurprised = this._surprise?.npcs?.surprised ?? false
    const playersSurprised = this._surprise?.players?.surprised ?? false
    const bothSidesSurprised = npcsSurprised && playersSurprised

    switch (this._environment) {
      case 'dungeon':
        return bothSidesSurprised ?
            EncounterRules.dungeonEncounterDistanceSurprised
          : EncounterRules.dungeonEncounterDistance
      case 'outdoors':
        return bothSidesSurprised ?
            EncounterRules.outdoorEncounterDistanceSurprised
          : EncounterRules.outdoorEncounterDistance
    }
  }

  /**
   * Given the encounter's environment and surprise status, roll the encounter distance. Will update the distance
   * and distanceRange properties with the results.
   */
  private _rollEncounterDistance() {
    const diceRoll = new DiceRoll(this._getEncounterDistanceDice())
    this._distance = diceRoll.total
    this._distanceRange = {
      max: diceRoll.maxTotal,
      min: diceRoll.minTotal,
    }
  }

  /**
   * If only one side is surprised, returns the side name (npcs or players). If neither side is surprised, or both sides
   * are surprised, null is returned.
   */
  public get onlySurprisedSide(): 'npcs' | 'players' | null {
    const npcsSurprised = this._surprise?.npcs?.surprised ?? false
    const playersSurprised = this._surprise?.players?.surprised ?? false

    if (npcsSurprised && !playersSurprised) {
      return 'npcs'
    } else if (playersSurprised && !npcsSurprised) {
      return 'players'
    } else {
      return null
    }
  }

  public get phase(): EncounterPhase {
    if (this._awareness === undefined) {
      return 'new'
    } else if (this._surprise === undefined) {
      return 'awareness-determined'
    } else if (this._initiative === undefined) {
      return 'surprise-and-distance-set'
    } else {
      return 'initiative-rolled'
    }
  }

  /**
   * Creates an immutable snapshot of the encounter's current state.
   */
  public createSnapshot(): EncounterSnapshot {
    const base = {
      awareness: this._awareness,
      distance: this._distance,
      distanceRange: this._distanceRange,
      initiative: this._initiative,
      phase: this.phase,
      surprise: this._surprise,
      timestamp: this._timestamp,
    }
    return base as EncounterSnapshot
  }

  /**
   * Type of environment in which the encounter is taking place.
   */
  public get environment(): 'dungeon' | 'outdoors' {
    return this._environment
  }

  /**
   * Retrieves the name of the side ('npcs', 'players') that won the initiative roll, or 'tie'. If the roll has not
   * happened yet, then `undefined` will be returned.
   */
  public get initiativeWinner(): 'npcs' | 'players' | 'tie' | undefined {
    const initiative = this._initiative
    if (!initiative) {
      return undefined
    }

    const npcs = initiative.npcs
    const players = initiative.players

    if (npcs === 'automatic') {
      return 'npcs'
    } else if (players === 'automatic') {
      return 'players'
    } else {
      return (
        npcs > players ? 'npcs'
        : players > npcs ? 'players'
        : 'tie'
      )
    }
  }

  /**
   * In-game time at which the encounter occurred. All encounters last one turn.
   */
  public get timestamp(): GameDateTime {
    return this._timestamp
  }

  public resetToPhase(phase: EncounterPhase): void {
    switch (phase) {
      case 'new':
        this._initiative = undefined
        this._distance = undefined
        this._distanceRange = undefined
        this._surprise = undefined
        this._awareness = undefined
        break
      case 'awareness-determined':
        this._distance = undefined
        this._distanceRange = undefined
        this._initiative = undefined
        this._surprise = undefined
        break
      case 'surprise-and-distance-set':
        this._initiative = undefined
        break
    }
  }

  /**
   * Records the player initiative roll, and rolls monster initiative for the encounter.
   */
  public rollInitiative(
    playerInitiativeResult: number,
    { npcInitiativeModifier = 0 }: { npcInitiativeModifier?: number } = {},
  ): void {
    const onlySurprisedSide = this.onlySurprisedSide
    if (onlySurprisedSide === 'npcs') {
      this._initiative = {
        npcs: 'surprised',
        players: 'automatic',
      }
    } else if (onlySurprisedSide === 'players') {
      this._initiative = {
        npcs: 'automatic',
        players: 'surprised',
      }
    } else {
      this._initiative = {
        npcs: new DiceRoll('d6').total + npcInitiativeModifier,
        players: playerInitiativeResult,
      }
    }
  }

  /**
   * Sets the 'surprise' data for the encounter. In addition to configuring the situational modifiers to surprise
   * chance, this will make a surprise roll for the NPCs and determine which side(s) are surprised.
   *
   * @param playerSurpriseRoll The d6 result of the player's surprise roll
   * @param options Situational modifiers to surprise. If unspecified, the default encounter rules are used.
   */
  public rollSurprise(
    playerSurpriseRoll: number,
    {
      surpriseChance = {
        npcs: EncounterRules.defaultSurpriseChance,
        players: EncounterRules.defaultSurpriseChance,
      },
    }: { surpriseChance?: Record<'npcs' | 'players', D6Result> } = {},
  ): void {
    const npcResult = rollCheck(surpriseChance.npcs)
    const playerResult = resolveCheckResult(surpriseChance.players, playerSurpriseRoll)

    this._surprise = {
      npcs:
        this._awareness?.npcs ?
          null
        : {
            chance: surpriseChance.npcs,
            roll: npcResult.roll,
            surprised: npcResult.meetsTarget,
          },
      players:
        this._awareness?.players ?
          null
        : {
            chance: surpriseChance.players,
            roll: playerResult.roll,
            surprised: playerResult.meetsTarget,
          },
    }

    this._rollEncounterDistance()

    // if only one side is surprised, then we can resolve initiative without any further input
    if (this.onlySurprisedSide !== null) {
      this.rollInitiative(0) // result does not matter in this case
    }
  }

  /**
   * Sets the 'awareness' data for the encounter.
   */
  public setAwareness(awareness: Awareness): void {
    this._awareness = awareness

    // if both sides are aware, then no surprise checks are required so we can move right into determining surprise
    // without any further input
    if (awareness.players && awareness.npcs) {
      this.rollSurprise(0) // result does not matter in this case
    }
  }

  public fromJSON(state: EncounterJson): void {
    this._awareness = state.awareness === undefined ? undefined : { ...state.awareness }
    this._distance = state.distance
    this._distanceRange = state.distanceRange === undefined ? undefined : { ...state.distanceRange }
    this._environment = state.environment ?? 'dungeon'
    this._initiative = state.initiative === undefined ? undefined : { ...state.initiative }
    this._surprise = state.surprise === undefined ? undefined : { ...state.surprise }
    this._timestamp = fromTimestamp(state.timestamp)
  }

  public toJSON(): Omit<EncounterJson, 'phase'> {
    return {
      awareness: this._awareness,
      distance: this._distance,
      distanceRange: this._distanceRange,
      environment: this._environment,
      initiative: this._initiative,
      surprise: this._surprise,
      timestamp: toTimestamp(this._timestamp),
    }
  }
}
