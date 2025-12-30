# Bookify Render API

Serverless API for the Bookify rendering platform using AWS Lambda.

## Prerequisites

- Node.js 24+
- pnpm 10.x
- Docker and Docker Compose
- AWS CLI configured with appropriate credentials (for deployment)

## Setup

Install dependencies:

```bash
pnpm install
```

Build the TypeScript code:

```bash
pnpm build
```

## Development Workflow

This project uses [`@twin-digital/serverless-dev-tools`](../../devtools/serverless-dev-tools) for local development. See the [serverless-dev-tools README](../../devtools/serverless-dev-tools/README.md) for detailed documentation on the development workflow, architecture, and how it works.

### Quick Start

Start the local development environment:

```bash
pnpm dev
```

This will:

1. Generate `docker-compose.yml` from `serverless.yml`
2. Start TypeScript build watch mode
3. Launch Docker Compose with:
   - **API Gateway** (OpenResty) on `http://localhost:9000`
   - **Lambda containers** for each function with hot-reload

The gateway automatically routes HTTP requests to the appropriate Lambda containers:

- `GET http://localhost:9000/version` → version Lambda
- `GET http://localhost:9000/render/html` → render-html Lambda

### Hot Reloading

Changes to TypeScript files trigger automatic rebuild and sync to Lambda containers with restart. No manual container rebuilds needed!

## Testing

Run tests:

```bash
pnpm test
```

Watch mode:

```bash
pnpm test:watch
```

Type checking:

```bash
pnpm typecheck
```

## Deployment

Deploy to AWS development stage:

```bash
pnpm deploy:dev
```

Deploy to production:

```bash
pnpm deploy:prod
```

Remove deployment:

```bash
pnpm destroy
```

View function logs:

```bash
pnpm logs
```

## Scripts Reference

- `pnpm dev` - Start local development environment
- `pnpm build` - Build TypeScript
- `pnpm watch` - Build TypeScript in watch mode
- `pnpm generate:compose` - Regenerate docker-compose.yml from serverless.yml
- `pnpm test` - Run tests
- `pnpm deploy:dev` - Deploy to dev stage
- `pnpm deploy:prod` - Deploy to prod stage
