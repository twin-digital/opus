import { describe, expect, it } from 'vitest'

import { EarTrainingGames } from './games.js'
import { makeStartNewChallenge } from './states/start-new-challenge.js'
import { makeInitialContext } from './call-and-response-context.js'

describe('EarTrainingGames', () => {
  it('gives every game a unique id and identity color', () => {
    const ids = EarTrainingGames.map((game) => game.id)
    expect(new Set(ids).size).toBe(ids.length)

    const colors = EarTrainingGames.map((game) => game.color.join(','))
    expect(new Set(colors).size).toBe(colors.length)
  })

  it.each(EarTrainingGames.map((game) => [game.id, game]))('%s produces fresh challenges', (_id, game) => {
    const first = game.createChallenge()
    const second = game.createChallenge()

    expect(first.getResult()).toBe('pending')
    expect(second).not.toBe(first)
  })
})

describe('start-new-challenge', () => {
  it('draws each new challenge from the game in context', () => {
    for (const game of EarTrainingGames) {
      const context = makeInitialContext(game)
      const initialChallenge = context.challenge

      makeStartNewChallenge()(context).enter()

      expect(context.challenge).not.toBe(initialChallenge)
      expect(context.challenge.getResult()).toBe('pending')
    }
  })
})
