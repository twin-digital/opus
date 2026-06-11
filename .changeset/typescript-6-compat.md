---
'@twin-digital/tsconfig': patch
'@twin-digital/refbash': patch
---

Support TypeScript 6. Drop the deprecated `downlevelIteration` compiler option from the shared tsconfig (a no-op at the configured ES2024 target, and an error under TS 6), and type the refbash store's items map as `ObservableMap` so it satisfies TS 6's updated `Map` lib definitions (`getOrInsert`/`getOrInsertComputed`).
