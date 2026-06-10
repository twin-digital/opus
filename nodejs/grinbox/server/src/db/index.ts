/**
 * State DB module surface. Downstream tasks (T0.4 daemon, S2/S3 write patterns)
 * import from here — `@twin-digital/grinbox-server` re-exports this barrel from its package
 * root, so consumers use `import { openDatabase, runMigrations } from
 * '@twin-digital/grinbox-server'`.
 */
export { ensureBootstrapUser } from './bootstrap.js'
export { closeDatabase, openDatabase } from './connection.js'
export { runMigrations } from './migrator.js'
export type {
  Database,
  DB,
  AccountsTable,
  ChangeLogTable,
  CredentialsTable,
  CurrentTriagesTable,
  LimitCountersMessageTable,
  LimitCountersWindowTable,
  LimitsTable,
  MessagesTable,
  OperatorCredentialReferencesTable,
  OperatorsTable,
  PipelinesTable,
  SchemaMigrationsTable,
  TagsTable,
  TriageEventsTable,
  TriageOperatorRunsTable,
  TriagesTable,
  UsersTable,
} from './schema.js'
export { DEFAULT_LIMITS, seedDefaultLimits } from './seed.js'
