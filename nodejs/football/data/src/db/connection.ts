import { mkdirSync } from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import { MIGRATIONS } from './migrations.js'

export type { Database } from 'better-sqlite3'

/** Open (creating parent directories as needed) and migrate the store. `:memory:` works for tests. */
export const openDatabase = (file: string): Database.Database => {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(file), { recursive: true })
  }
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

export const migrate = (db: Database.Database): void => {
  db.exec('CREATE TABLE IF NOT EXISTS migration (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied = new Set((db.prepare('SELECT id FROM migration').all() as { id: string }[]).map((row) => row.id))
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue
    }
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO migration (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString())
    })()
  }
}
