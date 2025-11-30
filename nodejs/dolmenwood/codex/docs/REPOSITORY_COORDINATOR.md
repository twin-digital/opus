# Repository Coordinator

A unified persistence layer for the Codex bot that stores all entity types in a single S3 JSON document.

## Architecture

```
┌─────────────────────────────────────────┐
│         Application Code                │
│  (Services, Commands, Behaviors)        │
└─────────────┬───────────────────────────┘
              │ Uses typed Repository<T>
              │
┌─────────────▼───────────────────────────┐
│      RepositoryCoordinator              │
│  - Manages lifecycle (init/flush)       │
│  - Debounces saves to S3                │
│  - Creates wrapped repositories         │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────────┐  ┌───────▼────┐
│MemoryRepo  │  │MemoryRepo  │
│ (players)  │  │(characters)│
└───┬────────┘  └───────┬────┘
    │                   │
    └─────────┬─────────┘
              │
      ┌───────▼──────────┐
      │  DocumentStore   │
      │  (S3 JSON blob)  │
      └──────────────────┘
```

## Key Features

- **Single JSON document**: All entity types stored together in one S3 object
- **Transparent**: Application code uses standard `Repository<T>` interface
- **Debounced saves**: Changes batched to minimize S3 writes (default: 2s)
- **Type-safe**: Full TypeScript support for entity types
- **Graceful shutdown**: `flush()` ensures all changes persisted before exit

## Usage

### 1. Define your entity types

```typescript
interface Player extends Record<string, unknown> {
  id: string
  name: string
  level: number
}
```

**Important**: All entities must:

- Extend `Record<string, unknown>`
- Have an `id: string` property (used as the key in the document)

### 2. Initialize the coordinator

```typescript
const coordinator = new RepositoryCoordinator({
  bucket: 'my-s3-bucket',
  documentId: 'bot-data.json',
  saveDebounceMs: 2000,
  log: consoleLogger,
})

await coordinator.init() // Loads existing data from S3
```

### 3. Get typed repositories

```typescript
const playerRepo = coordinator.getRepository<Player>('players')
const characterRepo = coordinator.getRepository<Character>('characters')
```

The first argument (`'players'`, `'characters'`) becomes the top-level key in the JSON document.

### 4. Use standard Repository operations

```typescript
// Create/update
await playerRepo.upsert('player1', {
  id: 'player1',
  name: 'Alice',
  level: 5,
})

// Read
const player = await playerRepo.get('player1')

// List all
const allPlayers = await playerRepo.list()

// Delete
await playerRepo.delete('player1')
```

### 5. Flush before shutdown

```typescript
process.on('SIGTERM', async () => {
  await coordinator.flush()
  process.exit(0)
})
```

## S3 Document Structure

The coordinator stores data in this format:

```json
{
  "players": {
    "player1": {
      "id": "player1",
      "name": "Alice",
      "level": 5
    },
    "player2": { ... }
  },
  "characters": {
    "char1": {
      "id": "char1",
      "playerId": "player1",
      "class": "Wizard",
      "stats": { "strength": 8, ... }
    }
  }
}
```

## Environment Variables

Required for bot startup:

- `CODEX_S3_BUCKET` - S3 bucket name
- `CODEX_S3_DOCUMENT_ID` - JSON filename (default: `codex-data.json`)
- `AWS_REGION` - AWS region for S3 client

## Implementation Notes

### Why debounced saves?

Rapid updates (e.g., multiple stat rolls in quick succession) would cause many S3 writes. Debouncing batches these into a single write, reducing costs and avoiding rate limits.

### When are changes saved?

- Automatically after `saveDebounceMs` (default 2000ms) following the last change
- Immediately when calling `coordinator.flush()`

### What if the bot crashes?

Changes made since the last successful save will be lost. For mission-critical data, consider:

- Shorter debounce interval (e.g., 500ms)
- Writing to DynamoDB instead of S3
- Adding backup/versioning to S3 bucket

### Multi-instance deployment?

This design assumes a **single bot instance**. Multiple instances would cause race conditions and data loss. For multi-instance:

- Use DynamoDB with conditional writes
- Implement optimistic locking with version numbers
- Use a distributed cache (Redis) as the source of truth

## Example

See `repository-coordinator.example.ts` for a complete working example.
