# @twin-digital/serverless-dev-tools

CLI tools for local Serverless Framework development with Docker Compose.

## Features

- **Generate docker-compose.yml from serverless.yml** - Single source of truth for function definitions
- **Local API Gateway simulation** - OpenResty/nginx with Lua transforms HTTP → Lambda event format
- **Hot-reload Lambda containers** - Changes sync automatically without rebuilds
- **Mixed deployment types** - Supports both container-based and zip-based Lambda functions

## Installation

```bash
pnpm add -D @twin-digital/serverless-dev-tools
```

## Usage

### Generate Docker Compose Configuration

Generate a `docker-compose.yml` file from your `serverless.yml`:

```bash
pnpm exec sls-dev-tools generate
```

Output to a specific file:

```bash
pnpm exec sls-dev-tools generate -o docker-compose.yml
```

Pipe to stdout (useful with `docker-dev`):

```bash
pnpm exec sls-dev-tools generate | docker-dev -
```

Specify a custom serverless config file:

```bash
pnpm exec sls-dev-tools generate serverless.custom.yml
```

### Complete Development Workflow

Recommended package.json scripts:

```json
{
  "scripts": {
    "dev": "pnpm exec sls-dev-tools generate | docker-dev -",
    "generate:compose": "pnpm exec sls-dev-tools generate -o docker-compose.yml"
  }
}
```

Then start development:

```bash
pnpm dev
```

This will:

1. Generate `docker-compose.yml` from `serverless.yml`
2. Pipe it to `docker-dev` which starts:
   - TypeScript build watch mode
   - Docker Compose with API Gateway and Lambda containers
   - Hot-reload on code changes

## Architecture

### Single Source of Truth: serverless.yml

All function definitions, routes, and configuration live in `serverless.yml`. The local development environment is automatically generated from this file.

### Generated Infrastructure

The tool generates a `docker-compose.yml` with:

- **Gateway service** - OpenResty/nginx with inline Dockerfile and config

  - Listens on `http://localhost:9000`
  - Routes HTTP requests to Lambda containers
  - Transforms requests to Lambda HTTP API v2 event format
  - Transforms Lambda responses back to HTTP

- **Lambda services** - One per function
  - Container-based functions use dedicated Dockerfiles
  - Zip-based functions use shared inline Dockerfile
  - Hot-reload via Docker Compose watch + sync+restart
  - YAML anchors eliminate configuration duplication

### Container vs Zip Functions

**Container-based functions:**

- Use when you need native dependencies (e.g., pandoc, imagemagick)
- Require dedicated Dockerfile in `src/functions/{name}/`
- Deployed as ECR container image
- Example:

  ```yaml
  functions:
    render-html:
      image:
        name: render-html
        command:
          - dist/render-html/render-html.handler
      events:
        - httpApi:
            path: /render/html
            method: get

  provider:
    ecr:
      images:
        render-html:
          path: ./
          file: src/functions/render-html/Dockerfile
  ```

**Zip-based functions:**

- Pure JavaScript/Node.js code
- Use shared inline Dockerfile
- Deployed as Lambda zip package
- Faster cold starts
- Example:
  ```yaml
  functions:
    version:
      handler: dist/version/version.handler
      events:
        - httpApi:
            path: /version
            method: get
  ```

## Development Workflow

### Hot Reloading

Changes to TypeScript files automatically trigger:

1. Rebuild (via your build tool, e.g., tsdown)
2. Sync to Lambda containers
3. Container restart with new code

No manual container rebuilds needed - just save and test!

### Adding a New Function

1. Add function definition to `serverless.yml`:

   ```yaml
   functions:
     my-new-function:
       handler: dist/my-new-function/my-new-function.handler
       events:
         - httpApi:
             path: /my/endpoint
             method: post
   ```

2. Create the handler file:

   ```bash
   mkdir -p src/handlers/my-new-function
   touch src/handlers/my-new-function/my-new-function.ts
   ```

3. Regenerate and restart:
   ```bash
   pnpm generate:compose
   docker compose restart
   ```

The new route will automatically be available at `http://localhost:9000/my/endpoint`.

## Requirements

- Node.js 24+
- Docker and Docker Compose
- Serverless Framework v4 project with `serverless.yml`

## How It Works

The generator:

1. Reads your `serverless.yml` configuration
2. Extracts function definitions and HTTP routes
3. Generates nginx config with route mappings
4. Creates Docker Compose services for:
   - Gateway (OpenResty with inline Dockerfile + nginx config)
   - Each Lambda function (with appropriate Dockerfile)
5. Configures Docker Compose watch for hot-reload
6. Uses YAML anchors to share configuration (watch configs, build objects)

The result is a complete local development environment that closely mirrors AWS Lambda + API Gateway behavior.

## License

ISC
