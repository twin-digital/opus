# Twin Digital: OPUS

Repository of all public works developed by Twin Digital.

## Package Summary

<!-- BEGIN repo-kit: PACKAGES -->

- [@twin-digital/context-server](./nodejs/apps/context-server): Web service providing contextual information for LLM queries.
- [@twin-digital/discord-bot](./nodejs/apps/discord-bot): Discord Bot providing server presence and message utilities for Twin Digital applications.
- [@twin-digital/bookify](./nodejs/bookify/bookify): Core logic and models for the Bookify platform
- [@twin-digital/bookify-cli](./nodejs/bookify/bookify-cli): CLI toolkit for interacting with the Bookify publishing engine.
- [@twin-digital/bookify-render-api](./nodejs/bookify/bookify-render-api): Serverless API for Bookify rendering platform
- [@twin-digital/eslint-config](./nodejs/devtools/eslint-config): Twin Digital's preferred eslint rules.
- [@twin-digital/json-patch-x](./nodejs/devtools/json-patch-x): JSON patch library that provides custom extensions for operations not found in RFC 6902.
- [@twin-digital/repo-kit](./nodejs/devtools/repo-kit): CLI utilities for configuring and maintaining monorepos
- [@twin-digital/tsconfig](./nodejs/devtools/tsconfig): Opinionated `tsconfig` files implementing modern defaults and familiar project layouts.
- [@twin-digital/vitest-config](./nodejs/devtools/vitest-config): Twin Digital's preferred vitest configuration.
- [@twin-digital/codex](./nodejs/dolmenwood/codex): Implementation of the 'Codex' bot.
- [@twin-digital/dolmenwood](./nodejs/dolmenwood/dolmenwood): Core game models and logic for Dolmenwood applications
- [@twin-digital/dolmenwood-bot](./nodejs/dolmenwood/dolmenwood-bot): Discord bot able to assist with questions during Dolmenwood games.
- [@twin-digital/refbash](./nodejs/dolmenwood/refbash): CLI console for managing Dolmenwood sessions
- [@twin-digital/bedrock](./nodejs/genai/bedrock): Utilities for integrating with AWS Bedrock.
- [@twin-digital/genai-core](./nodejs/genai/genai-core): Core types and utilities for building GenAI applications and services.
- [@twin-digital/opus-scripts](./tooling/scripts): Scripts used to perform package-level operations in the Opus repository.

<!-- END repo-kit: PACKAGES -->

## Monorepo Architecture

### Source-First Development with the `source` Condition

This monorepo uses a modern development pattern where packages can be built directly from TypeScript source files rather than requiring pre-built artifacts. This is accomplished using Node.js conditional exports with a custom `source` condition.

#### How It Works

Packages in this monorepo configure their `package.json` exports to provide multiple resolution paths:

```json
{
  "exports": {
    ".": {
      "source": "./src/index.ts",
      // ... other exports as normal
    }
  }
}
```

- **`source`**: Custom condition that points to TypeScript source files

Consumer packages opt into source resolution by configuring TypeScript:

```json
// tsconfig.json
{
  "compilerOptions": {
    "customConditions": ["source"]
  }
}
```

And build tools (like `tsdown`) are configured to use the same condition:

```typescript
// tsdown.config.ts
export default defineConfig({
  inputOptions: {
    resolve: {
      conditionNames: ['source'],
    },
  },
  // ...
})
```

#### Why We Use This Pattern

**Development Benefits:**
- **No intermediate builds**: Don't need to build dependencies before building consumers
- **Always fresh code**: Impossible to have stale dist files causing bugs
- **Faster iteration**: Change source → rebuild consumer → see results immediately
- **Simpler workflow**: One build strategy for both dev and production

**Monorepo Benefits:**
- **Eliminates build orchestration**: No need to `pnpm build` packages in dependency order
- **Works with watch mode**: Changes to dependencies automatically trigger rebuilds
- **Cleaner dev scripts**: Just run watch on the package you're working on

**Production Safety:**
- Dev and production use the same source files (no "works in dev, breaks in prod")
- External npm users automatically fall back to dist files (when `src/` isn't published)
- Modern bundlers handle TypeScript efficiently, so performance impact is negligible
