import type { Founding } from './types.js'

const RULE = '─'.repeat(60)

/** Render a founding as a readable, diegetic "founding record" — no graphics, just prose + structure. */
export const renderFounding = (f: Founding): string => {
  const lines: string[] = []

  lines.push(RULE)
  lines.push(`  ${f.name.toUpperCase()}`.padEnd(50) + `seed ${f.seed}`)
  lines.push(RULE)
  lines.push('')

  lines.push(`CHARTER    ${f.charter.purpose}`)
  lines.push(`  shape    ${f.charter.arcShape} — ${f.charter.arcGloss}`)
  lines.push(`  demands  ${f.charter.domains.join(' · ')}`)
  lines.push('')

  lines.push(`THEME      ${f.themeTags.join(' · ')}`)
  lines.push(`MOOD       ${f.mood}`)
  lines.push('')

  lines.push(`THE KNOWN  (${f.cast.length} named, of perhaps ${f.membership})`)
  for (const s of f.cast) {
    const who = s.epithet ? `${s.name}, ${s.epithet}` : s.name
    const flavor = s.flavor ? `  — ${s.flavor}` : ''
    lines.push(`  ${who.padEnd(30)} ${s.domain.padEnd(11)} ${s.temperament.join('/')}${flavor}`)
  }
  lines.push('')

  lines.push('A LIVE TENSION')
  lines.push(`  ${f.tension}`)
  lines.push('')

  lines.push('AN OPEN THREAD')
  lines.push(`  ${f.openThread}`)
  lines.push(RULE)

  return lines.join('\n')
}
