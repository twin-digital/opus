# context-server

## Developing

Minimal Fastify JSON API for context lookups (development scaffold).

Run in development (uses `tsx`):

```bash
cd nodejs/apps/context-server
cp .env.example .env # edit variables as needed
pnpm install
pnpm dev
```

POST `/context/query` accepts JSON body:

```json
{
  "kbId": "string",
  "query": "string",
  "chunks": 6 // optional
}
```

Response:

```json
{
  "status": "ok",
  "metadata": { "kb": "...", "requested": { "chunks": 6 }, "returned": 6 },
  "chunks": [{ "text": "...", "metadata": {} }]
}
```
