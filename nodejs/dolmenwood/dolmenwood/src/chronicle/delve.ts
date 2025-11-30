import { randomUUID } from 'node:crypto'
import { DEFAULT_DATE_TIME } from '../date-time/calendar.js'
import type { GameDateTime } from '../date-time/model.js'
import { addTurns, difference, fromTimestamp, toTimestamp } from '../date-time/math.js'
import type { Activity } from './activity.js'
import { IidGenerator } from '../data/iid-sequence.js'

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
  id: string
  iids: Record<string, number>
  lightSources: (Omit<LightSource, 'litAt'> & { litAt: number })[]
  siteName: string
  startTime: number
  turns: number
}

/**
 * A Delve is an investigation of a localized site such as a ruin, barrow, cave, or faerie landmark. They are
 * usually carried out during an {@link Expedition}.
 */
export class Delve implements Activity {
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

  public constructor(public readonly id: string = randomUUID()) {}

  public addLightSource(lightSource: AddLightSourceData): void {
    const newLightSource = {
      ...lightSource,
      iid: this._iids.next('light-source'),
      litAt: this.endTime,
    }

    this._lightSources.add(newLightSource)
  }

  /**
   * Latest time and date of the delve. Either the current time in the Delve (if active), or the time it ended (if
   * completed). This is derived from the {@link startTime} and {@link turns} values.
   */
  public get endTime(): GameDateTime {
    return addTurns(this.startTime, this.turns - 1)
  }

  /**
   * Retrieves the light sources used in this delve.
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
      .filter(({ maximumDuration, turnsRemaining }) => turnsRemaining > 0 && turnsRemaining <= maximumDuration)
  }

  /**
   * The title of the activity, which for Delves is the `siteName`.
   */
  public get title(): string {
    return this.siteName
  }

  /**
   * Advances the turn by the specified delta, which may be negative.
   */
  public advanceTurn(delta = 1): void {
    this.turns = Math.max(1, this.turns + delta)
  }

  public fromJSON(state: DelveJson): void {
    const lightSources = new Set<LightSource>()
    state.lightSources.forEach((lightSource) => {
      lightSources.add({
        ...lightSource,
        litAt: fromTimestamp(lightSource.litAt),
      })
    })

    this._iids.fromJSON(state.iids)
    this._lightSources = lightSources
    this.siteName = state.siteName
    this.startTime = fromTimestamp(state.startTime)
    this.turns = state.turns
  }

  public toJSON(): DelveJson {
    return {
      id: this.id,
      iids: this._iids.toJSON(),
      lightSources: [...this._lightSources].map((lightSource) => ({
        ...lightSource,
        litAt: toTimestamp(lightSource.litAt),
      })),
      siteName: this.siteName,
      startTime: toTimestamp(this.startTime),
      turns: this.turns,
    }
  }
}
