import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  FpProjectionParseError,
  chunkIds,
  parseFpApiPlayers,
  parseFpProjections,
  withRateLimitRetry,
  type FpProjectionPosition,
} from './fantasypros-projections.js'
import { FetchError } from './http.js'

/** Verbatim snippets of the live pages (see __test__/), so structure drift breaks tests first. */
const fixture = (position: FpProjectionPosition): string =>
  readFileSync(
    path.resolve(fileURLToPath(import.meta.url), `../__test__/fantasypros-projections-${position.toLowerCase()}.html`),
    'utf8',
  )

describe('parseFpProjections', () => {
  it('parses the QB page with passing-block ATT/YDS/TDS mapped to passing keys', () => {
    const rows = parseFpProjections(fixture('QB'), 'QB')
    expect(rows).toHaveLength(10)
    const allen = rows[0]
    expect(allen).toMatchObject({ fpId: 17298, name: 'Josh Allen', filename: 'josh-allen-qb', team: 'BUF' })
    expect(allen?.stats).toEqual({
      passAtt: 491.9,
      passCmp: 333.4,
      passYd: 3816.8, // comma-formatted on the page
      passTd: 27.4,
      passInt: 11.2,
      rushAtt: 118.1,
      rushYd: 586.0,
      rushTd: 11.8,
      fumLost: 4.1,
    })
    expect(allen?.fpts).toBe(372.471) // full-precision data-sort-value, not the rounded display
  })

  it('parses the RB page with the rushing block first', () => {
    const rows = parseFpProjections(fixture('RB'), 'RB')
    expect(rows).toHaveLength(10)
    const gibbs = rows[0]
    expect(gibbs).toMatchObject({ fpId: 22968, name: 'Jahmyr Gibbs', team: 'DET' })
    expect(gibbs?.stats).toEqual({
      rushAtt: 274.7,
      rushYd: 1382.5,
      rushTd: 13.8,
      rec: 71.3,
      recYd: 581.0,
      recTd: 4.1,
      fumLost: 1.1,
    })
  })

  it('parses the WR page with the receiving block first and rushing second', () => {
    const rows = parseFpProjections(fixture('WR'), 'WR')
    expect(rows).toHaveLength(10)
    const nacua = rows[0]
    expect(nacua).toMatchObject({ fpId: 23180, name: 'Puka Nacua' })
    expect(nacua?.stats).toEqual({
      rec: 117.0,
      recYd: 1539.0,
      recTd: 9.0,
      rushAtt: 13.6,
      rushYd: 85.0,
      rushTd: 1.4,
      fumLost: 1.0,
    })
  })

  it('parses the TE page (receiving and FL only)', () => {
    const rows = parseFpProjections(fixture('TE'), 'TE')
    expect(rows).toHaveLength(10)
    const mcbride = rows[0]
    expect(mcbride).toMatchObject({ fpId: 22936, name: 'Trey McBride', team: 'ARI' })
    expect(mcbride?.stats).toEqual({ rec: 108.9, recYd: 1069.1, recTd: 6.8, fumLost: 0.2 })
  })

  it('decodes HTML entities in player names', () => {
    const html = fixture('WR').replace('fp-player-name="Ja\'Marr Chase"', 'fp-player-name="Ja&#39;Marr Chase"')
    const rows = parseFpProjections(html, 'WR')
    expect(rows.map((row) => row.name)).toContain("Ja'Marr Chase")
  })

  it('throws when a column header is renamed rather than misparsing', () => {
    const html = fixture('WR').replace('<small>REC</small>', '<small>RECS</small>')
    expect(() => parseFpProjections(html, 'WR')).toThrow(FpProjectionParseError)
    expect(() => parseFpProjections(html, 'WR')).toThrow(/column headers/)
  })

  it('throws when a stat group is renamed or reordered', () => {
    const html = fixture('RB').replace('<b>RUSHING</b>', '<b>RECEIVING</b>')
    expect(() => parseFpProjections(html, 'RB')).toThrow(/header groups/)
  })

  it('throws when parsing a page against the wrong position layout', () => {
    // QB markup read as RB: same headers positionally would silently swap meanings — the group
    // and column guard must catch it.
    expect(() => parseFpProjections(fixture('QB'), 'RB')).toThrow(FpProjectionParseError)
  })

  it('throws when a row has the wrong number of stat cells', () => {
    const html = fixture('TE').replace('<td class="center">108.9</td>', '')
    expect(() => parseFpProjections(html, 'TE')).toThrow(/stat cells/)
  })

  it('throws when the data table is missing entirely', () => {
    expect(() => parseFpProjections('<html>redesigned page</html>', 'QB')).toThrow(/no id="data" table/)
  })

  it('throws when the table has no player rows', () => {
    const html = fixture('QB').replace(/<tr class="mpb-player[\s\S]*?<\/tr>/g, '')
    expect(() => parseFpProjections(html, 'QB')).toThrow(/no player rows/)
  })
})

/** Trimmed real responses of GET /public/v2/json/nfl/2026/projections?position={POS}&week=0. */
const apiFixture = (position: FpProjectionPosition): unknown =>
  JSON.parse(
    readFileSync(
      path.resolve(
        fileURLToPath(import.meta.url),
        `../__test__/fantasypros-api-projections-${position.toLowerCase()}.json`,
      ),
      'utf8',
    ),
  )

describe('parseFpApiPlayers', () => {
  it('maps QB stat fields to passing/rushing keys and ignores bonus buckets', () => {
    const rows = parseFpApiPlayers(apiFixture('QB'), 'QB')
    expect(rows).toHaveLength(3)
    const allen = rows[0]
    expect(allen).toMatchObject({ fpId: 17298, name: 'Josh Allen', filename: 'josh-allen-qb', team: 'BUF' })
    expect(allen?.stats).toEqual({
      passAtt: 491.88,
      passCmp: 333.36,
      passYd: 3816.77,
      passTd: 27.42,
      passInt: 11.19,
      rushAtt: 118.13,
      rushYd: 585.97,
      rushTd: 11.82,
      fumLost: 4.1, // API `fumbles` = the page's FL column
    })
    expect(allen?.prescored).toEqual({ std: 372.47, half: 372.47, ppr: 372.47 })
    expect(allen?.fpts).toBe(372.47) // points_half, the format validation confirms
  })

  it('maps RB receiving fields and keeps fractional stat values as-is', () => {
    const rows = parseFpApiPlayers(apiFixture('RB'), 'RB')
    const gibbs = rows.find((row) => row.name === 'Jahmyr Gibbs')
    expect(gibbs).toMatchObject({ fpId: 22968, team: 'DET' })
    expect(gibbs?.stats).toEqual({
      rushAtt: 274.69,
      rushYd: 1382.53,
      rushTd: 13.82,
      rec: 71.26,
      recYd: 580.97,
      recTd: 4.13,
      fumLost: 1.13,
    })
    expect(gibbs?.prescored).toEqual({ std: 301.75, half: 337.38, ppr: 373.01 })
  })

  it('throws when the response carries another position', () => {
    expect(() => parseFpApiPlayers(apiFixture('QB'), 'RB')).toThrow(FpProjectionParseError)
    expect(() => parseFpApiPlayers(apiFixture('QB'), 'RB')).toThrow(/position QB/)
  })

  it('throws when the response has no players[] (never yields garbage rows)', () => {
    expect(() => parseFpApiPlayers({ count: '10' }, 'QB')).toThrow(/no players\[\]/)
    expect(() => parseFpApiPlayers(null, 'QB')).toThrow(/no players\[\]/)
  })

  it('accepts an empty batch (requested ids simply have no projections)', () => {
    expect(parseFpApiPlayers({ players: [] }, 'QB')).toEqual([])
  })

  it('throws when a player lacks points_half', () => {
    const fixture = apiFixture('RB') as { players: { stats: Record<string, number> }[] }
    const player = fixture.players[0] as { stats: Record<string, number> }
    delete player.stats.points_half
    expect(() => parseFpApiPlayers({ players: [player] }, 'RB')).toThrow(/points_half/)
  })

  it('throws on a non-numeric stat field', () => {
    const fixture = apiFixture('RB') as { players: { stats: Record<string, unknown> }[] }
    const player = fixture.players[0] as { stats: Record<string, unknown> }
    player.stats.rush_att = 'a lot'
    expect(() => parseFpApiPlayers({ players: [player] }, 'RB')).toThrow(/non-numeric rush_att/)
  })
})

describe('withRateLimitRetry', () => {
  it('waits out the rate-limit window on 429 and retries', async () => {
    const waits: number[] = []
    let attempts = 0
    const result = await withRateLimitRetry(
      () => {
        attempts++
        return attempts < 3 ?
            Promise.reject(new FetchError('https://api', 'HTTP 429 Too Many Requests', 429))
          : Promise.resolve('ok')
      },
      (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    )
    expect(result).toBe('ok')
    expect(attempts).toBe(3)
    expect(waits).toHaveLength(2)
  })

  it('rethrows non-429 failures immediately', async () => {
    const failure = new FetchError('https://api', 'HTTP 403 Forbidden', 403)
    await expect(
      withRateLimitRetry(
        () => Promise.reject(failure),
        () => Promise.resolve(),
      ),
    ).rejects.toBe(failure)
  })

  it('gives up after the configured retries', async () => {
    let attempts = 0
    await expect(
      withRateLimitRetry(
        () => {
          attempts++
          return Promise.reject(new FetchError('https://api', 'HTTP 429 Too Many Requests', 429))
        },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow(/429/)
    expect(attempts).toBe(3)
  })
})

describe('chunkIds', () => {
  it('batches ids to the free-tier response cap', () => {
    const ids = Array.from({ length: 25 }, (_, i) => i + 1)
    const batches = chunkIds(ids)
    expect(batches.map((batch) => batch.length)).toEqual([10, 10, 5])
    expect(batches.flat()).toEqual(ids)
    expect(chunkIds([])).toEqual([])
  })
})
