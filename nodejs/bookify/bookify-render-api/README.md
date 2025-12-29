# Bookify API

Serverless API for the Bookify platform using AWS Lambda with container images.

## Prerequisites

- Node.js 24+
- AWS CLI configured with appropriate credentials
- Docker (for building container images)
- pnpm (for package management)

## Setup

Install dependencies:

```bash
pnpm install
```

## Development

Build the TypeScript code:

```bash
pnpm build
```

Type checking:

```bash
pnpm typecheck
```

## Deployment

Deploy to development stage:

```bash
pnpm deploy:dev
```

Deploy to production stage:

```bash
pnpm deploy:prod
```

Remove deployment:

```bash
pnpm remove
```

## Testing

Invoke the hello function locally:

```bash
pnpm invoke
```

View function logs:

```bash
pnpm logs
```

## Architecture

This API uses:

- **Serverless Framework** for infrastructure as code
- **AWS Lambda with Container Images** for compute
- **API Gateway HTTP API** for REST endpoints
