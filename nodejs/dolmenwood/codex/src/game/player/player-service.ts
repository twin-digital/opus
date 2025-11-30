import { randomUUID } from 'node:crypto'
import type { Repository } from '../../core/db/repository.js'
import { findOrCreate, patchRecord } from '../../core/db/utils.js'
import type { Player, PlayerCharacter, PlayerService } from '../model.js'

export class DefaultPlayerService implements PlayerService {
  public constructor(
    private _players: Repository<Player>,
    private _pcs: Repository<PlayerCharacter>,
  ) {}

  public async getPlayer(discordPlayerId: string): Promise<Player> {
    return findOrCreate(this._players, discordPlayerId)
  }

  public async getPlayerAndCharacter(discordPlayerId: string): Promise<{ character: PlayerCharacter; player: Player }> {
    const existingPlayer = await this.getPlayer(discordPlayerId)
    const activeCharacterId = existingPlayer.activeCharacterId ?? randomUUID()

    const character = await findOrCreate(this._pcs, activeCharacterId, {
      id: activeCharacterId,
      playerId: existingPlayer.id,
    })

    const player =
      existingPlayer.activeCharacterId !== undefined ?
        existingPlayer
      : await patchRecord(this._players, discordPlayerId, {
          activeCharacterId,
        })

    return {
      character,
      player,
    }
  }
}
