import type { Repository } from '../../core/db/repository.js'
import { findOrCreate, patchRecord } from '../../core/db/utils.js'
import { rollOne } from '../../game/dice/roll.js'
import type {
  CharacterStats,
  PlayerCharacter,
  PlayerCharacterService,
  PlayerCharacterStatRoll,
  StatRoll,
} from '../model.js'
import { extractDieValues } from '../../game/dice/results.js'
import { randomUUID } from 'node:crypto'
import { sum } from 'lodash-es'

export class DefaultPlayerCharacterService implements PlayerCharacterService {
  public constructor(
    private _playerCharacters: Repository<PlayerCharacter>,
    private _playerCharacterStatRolls: Repository<PlayerCharacterStatRoll>,
  ) {}

  public async rollStats(characterId: string): Promise<{ isNew: boolean; results: PlayerCharacterStatRoll }> {
    const character = await findOrCreate(this._playerCharacters, characterId)

    const existingRoll: PlayerCharacterStatRoll | null =
      character.statRollId !== undefined ?
        ((await this._playerCharacterStatRolls.get(character.statRollId)) ?? null)
      : null

    const roll = existingRoll ?? (await this._rollNewStats(character.id))

    return {
      isNew: existingRoll === null,
      results: roll,
    }
  }

  private _rollToStats(roll: StatRoll): CharacterStats {
    return {
      strength: sum(roll.strength),
      intelligence: sum(roll.intelligence),
      wisdom: sum(roll.wisdom),
      dexterity: sum(roll.dexterity),
      constitution: sum(roll.constitution),
      charisma: sum(roll.charisma),
    }
  }

  private async _rollNewStats(characterId: string): Promise<PlayerCharacterStatRoll> {
    const roll = {
      id: randomUUID(),
      rolledAt: new Date().toISOString(),
      rolls: {
        strength: extractDieValues(rollOne('3d6')),
        intelligence: extractDieValues(rollOne('3d6')),
        wisdom: extractDieValues(rollOne('3d6')),
        dexterity: extractDieValues(rollOne('3d6')),
        constitution: extractDieValues(rollOne('3d6')),
        charisma: extractDieValues(rollOne('3d6')),
      },
    }

    await this._playerCharacterStatRolls.upsert(roll.id, roll)
    await patchRecord(this._playerCharacters, characterId, {
      statRollId: roll.id,
      stats: this._rollToStats(roll.rolls),
    })

    return roll
  }
}
