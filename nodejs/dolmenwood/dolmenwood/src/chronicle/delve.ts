import { randomUUID } from 'node:crypto'
import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import type { GameDateTime } from '../date-time/model.js'
import { addTurns, difference, fromTimestamp, toTimestamp } from '../date-time/math.js'
import type { Activity } from './activity.js'
import { IidGenerator } from '../data/iid-sequence.js'
import { EventLog, type EventLogJson } from './event-log.js'
import { DiceRoll } from '@dice-roller/rpg-dice-roller'
import { Encounter, type EncounterJson } from './encounter.js'
import { makeAutoObservable } from 'mobx'

/**
 * Details of a light source which was activated during the delve.
 */
export interface LightSource {
  /**
   * Name of the entity carrying the light source.
   */
  carriedBy: string

  /**
   * Delve-scoped ID of this light source.
   */
  iid: number

  /**
   * Maximum amount of time the light source lasts, in turns.
   */
  maximumDuration: number

  /**
   * Timestamp at which the light source was lit.
   */
  litAt: GameDateTime

  /**
   * Description of the type of light source.
   */
  type: string
}

export interface WanderingMonsterConfig {
  /**
   * The chance (X-in-6) that a check results in a wandering monster.
   */
  chance: 1 | 2 | 3 | 4 | 5 | 6

  /**
   * How frequently checks for wandering monsters are made. How this is interpreted depends on the value of
   * `checkFrequencyType`.
   */
  checkFrequency: number

  /**
   * Type of mechanism used to determine if a wandering monster check is required:
   *
   * - interval: Basic system described in DPB p. 163. A check is made every 'frequency' turns
   * - probability: Less predictable system where, every turn, there is a <FREQUENCY>% chance that a wandering monster
   *   check is made. (Note this is not the chance of wandering monsters -- just the chance that a check is made.)
   *
   * @defaultValue interval
   */
  checkFrequencyType?: 'interval' | 'probability'
}

export type AddLightSourceData = Omit<LightSource, 'iid' | 'litAt'>

/**
 * Summary of a currently-active light source.
 */
export interface ActiveLightSource {
  /**
   * Name of the entity carrying the light source.
   */
  carriedBy: string

  /**
   * Delve-scoped ID of this light source.
   */
  iid: number

  /**
   * Maximum amount of time the light source lasts, in turns.
   */
  maximumDuration: number

  /**
   * Number of turns for which this light source will remain active.
   */
  turnsRemaining: number

  /**
   * Description of the type of light source.
   */
  type: string
}

/**
 * Core model representing a single Delve.
 */
export interface DelveJson {
  encounters?: EncounterJson[]
  eventLog: EventLogJson[]
  id: string
  iids: Record<string, number>
  lightSources: (Omit<LightSource, 'litAt'> & { litAt: number })[]
  siteName: string
  startTime: number
  turns: number
  wanderingMonsterConfig?: WanderingMonsterConfig
}

/**
 * A Delve is an investigation of a localized site such as a ruin, barrow, cave, or faerie landmark. They are
 * usually carried out during an {@link Expedition}.
 */
export class Delve implements Activity {
  /**
   * Encounters which occurred during this delve.
   */
  private _encounters: Set<Encounter> = new Set<Encounter>()

  /**
   * List of events which occurred during this delve.
   */
  public readonly eventLog: EventLog = new EventLog()

  private _iids = new IidGenerator()

  /**
   * Light sources used in this delve.
   */
  private _lightSources: Set<LightSource> = new Set<LightSource>()

  public readonly activityType = 'delve'

  /**
   * Name of the dungeon site (i.e., the entire location)
   */
  public siteName = 'Unknown Dungeon'

  /**
   * Date and time at which this delve began.
   */
  public startTime: GameDateTime = DEFAULT_DATE_TIME

  /**
   * Duration of the delve, in Turns
   */
  public turns = 1

  private _wanderingMonsterConfig: WanderingMonsterConfig = {
    chance: 1,
    checkFrequency: 2,
    checkFrequencyType: 'interval',
  }

  public constructor(public readonly id: string = randomUUID()) {
    makeAutoObservable(this)
  }

  private _shouldCheckForWanderingMonsters(): boolean {
    switch (this._wanderingMonsterConfig.checkFrequencyType ?? 'interval') {
      case 'interval':
        return this.turns % this._wanderingMonsterConfig.checkFrequency === 0
      case 'probability':
        return new DiceRoll('d100').total <= this._wanderingMonsterConfig.checkFrequency
    }
  }

  /**
   * Latest time and date of the delve. Either the current time in the Delve (if active), or the time it ended (if
   * completed). This is derived from the {@link startTime} and {@link turns} values.
   */
  public get endTime(): GameDateTime {
    return addTurns(this.startTime, this.turns - 1)
  }

  /**
   * If there is an active encounter for the current turn, return its details.
   */
  public get activeEncounter(): undefined | Encounter {
    return [...this._encounters.values()].find(
      (encounter) => toTimestamp(this.endTime) === toTimestamp(encounter.timestamp),
    )
  }

  /**
   * Retrieves the active light sources for this delve. A light source is "active" if it is (a) still burning or (b)
   * expired on the current turn.
   */
  public get activeLightSources(): readonly ActiveLightSource[] {
    return [...this._lightSources.values()]
      .map((lightSource) => ({
        carriedBy: lightSource.carriedBy,
        iid: lightSource.iid,
        maximumDuration: lightSource.maximumDuration,
        type: lightSource.type,
        turnsRemaining: lightSource.maximumDuration - difference(lightSource.litAt, this.endTime, 'turn'),
      }))
      .filter(({ maximumDuration, turnsRemaining }) => turnsRemaining >= 0 && turnsRemaining <= maximumDuration)
  }

  /**
   * The title of the activity, which for Delves is the `siteName`.
   */
  public get title(): string {
    return this.siteName
  }

  public get wanderingMonsterConfig(): Readonly<WanderingMonsterConfig> {
    return this._wanderingMonsterConfig
  }

  public addLightSource(lightSource: AddLightSourceData): void {
    const newLightSource = {
      ...lightSource,
      iid: this._iids.next('light-source'),
      litAt: this.endTime,
    }

    this._lightSources.add(newLightSource)
  }

  /**
   * Advances the turn by the specified delta, which may be negative.
   */
  public advanceTurn(delta = 1): void {
    this.turns = Math.max(1, this.turns + delta)

    if (delta < 0) {
      this.eventLog.rewindTo(this.endTime)
      return
    }

    // add events for any expired lights
    this.activeLightSources.forEach((light) => {
      if (light.turnsRemaining === 0) {
        this.eventLog.addEvent(`${light.carriedBy}'s ${light.type} went out.`, this.endTime)
      }
    })

    // check for wandering monsters as needed
    if (this._shouldCheckForWanderingMonsters()) {
      this.checkForWanderingMonsters('routine')
    }
  }

  /**
   * Initiate a check for wandering monsters, with an optional reason for the check. If no reason is given, then
   * 'routine' will be used.
   */
  public checkForWanderingMonsters(reason = 'routine'): void {
    const reasonString = reason ? ` (${reason})` : ''

    const checkResult = new DiceRoll('d6').total
    if (checkResult <= this.wanderingMonsterConfig.chance) {
      this.eventLog.addEvent(`Wandering check${reasonString}: ENCOUNTER!`, this.endTime)

      if (!this.activeEncounter) {
        this._encounters.add(new Encounter('dungeon', this.endTime))
      }
    } else if (reason !== 'routine') {
      this.eventLog.addEvent(`Wandering check${reasonString}: none`, this.endTime)
    }
  }

  /**
   * Deletes the light source with the specified IID. This method is idempotent, and will silently do nothing if there
   * is no light with the given id.
   */
  public deleteLightSource(iid: number): void {
    for (const lightSource of this._lightSources) {
      if (lightSource.iid === iid) {
        this._lightSources.delete(lightSource)
        break
      }
    }
  }

  public fromJSON(state: DelveJson): void {
    const lightSources = new Set<LightSource>()
    state.lightSources.forEach((lightSource) => {
      lightSources.add({
        ...lightSource,
        litAt: fromTimestamp(lightSource.litAt),
      })
    })

    this._encounters = new Set<Encounter>()
    ;(state.encounters ?? []).forEach((json) => {
      const encounter = new Encounter('dungeon')
      encounter.fromJSON(json)
      this._encounters.add(encounter)
    })

    this.eventLog.fromJSON(state.eventLog)
    this._iids.fromJSON(state.iids)
    this._lightSources = lightSources
    this.siteName = state.siteName
    this.startTime = fromTimestamp(state.startTime)
    this.turns = state.turns
    this._wanderingMonsterConfig = state.wanderingMonsterConfig ?? {
      chance: 1,
      checkFrequency: 2,
    }
  }

  public toJSON(): DelveJson {
    return {
      encounters: this._encounters
        .values()
        .map((encounter) => encounter.toJSON())
        .toArray(),
      eventLog: this.eventLog.toJSON(),
      id: this.id,
      iids: this._iids.toJSON(),
      lightSources: [...this._lightSources].map((lightSource) => ({
        ...lightSource,
        litAt: toTimestamp(lightSource.litAt),
      })),
      siteName: this.siteName,
      startTime: toTimestamp(this.startTime),
      turns: this.turns,
      wanderingMonsterConfig: this._wanderingMonsterConfig,
    }
  }
}
