---
'@thrashplay/fw-chronicler': minor
'@thrashplay/farwatch': minor
---

feat(farwatch): add an `ollama` chronicler backend with per-call model selection.

Select with `CHRONICLER_LLM=ollama`; it calls a self-hosted Ollama server's `POST /api/generate` (non-streaming), with thinking disabled and gemma4-tuned generation options. Configure the server with `OLLAMA_HOST` (e.g. `http://10.111.1.172:11434`, a bare `host:port` is accepted; defaults to localhost) and the default model with `CHRONICLER_MODEL`.

The `Llm` surface gains an optional `options` arg (`{ model?, params? }`), so a model and extra generation params can be passed per call rather than only via env. The inspector adds a **model dropdown** populated on load from the server's installed models (`listOllamaModels()` → `GET /api/tags`); the selected model is sent with each run. Also fixes `main.ts` loading `.env` from the wrong directory (now matches `serve.ts` at the repo root).
