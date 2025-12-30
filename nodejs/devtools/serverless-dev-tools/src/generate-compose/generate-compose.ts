import type {
  BuildConfig,
  DockerComposeFile,
  DockerService,
  ServerlessConfig,
  ServerlessFunction,
  WatchConfig,
} from './types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert kebab-case function name to snake_case service name
 * Docker Compose service names work better with underscores
 */
function toServiceName(functionName: string): string {
  return functionName.replace(/-/g, '_')
}

/**
 * Extract the HTTP path from a function's events
 */
function getHttpPath(func: ServerlessFunction): string | undefined {
  const httpEvent = func.events?.find((e) => e.httpApi)
  return httpEvent?.httpApi?.path
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate nginx config for the gateway
 */
function generateNginxConfig(serverless: ServerlessConfig): string {
  const routes: string[] = []

  for (const [functionName, func] of Object.entries(serverless.functions)) {
    const path = getHttpPath(func)
    if (!path) continue

    const serviceName = toServiceName(functionName)

    // Static location block with minimal Lua (only for JSON encode/decode)
    routes.push(`  location = ${path} {
    set $target "${serviceName}";
    set $route_path "${path}";
    rewrite ^ /proxy last;
  }`)
  }

  const routeList = Object.values(serverless.functions)
    .map((func) => `"${getHttpPath(func) ?? ''}"`)
    .join(', ')

  return `resolver 127.0.0.11 valid=10s;
lua_need_request_body on;

server {
  listen 80;
  set $lambda_event_json "";

${routes.join('\n\n')}

  location = /proxy {
    internal;
    
    rewrite_by_lua_block {
      local cjson = require "cjson"
      local headers = {}
      for k, v in pairs(ngx.req.get_headers()) do headers[k] = v end
      
      local query_params = {}
      for k, v in pairs(ngx.req.get_uri_args()) do query_params[k] = v end
      
      local body = ngx.var.request_body or ""
      local route_path = ngx.var.route_path
      
      ngx.var.lambda_event_json = cjson.encode({
        version = "2.0",
        routeKey = ngx.var.request_method .. " " .. route_path,
        rawPath = route_path,
        rawQueryString = ngx.var.query_string or "",
        headers = headers,
        queryStringParameters = next(query_params) and query_params or nil,
        requestContext = {
          accountId = "local", apiId = "local",
          domainName = ngx.var.host, domainPrefix = "local",
          http = {
            method = ngx.var.request_method, path = route_path,
            protocol = "HTTP/1.1", sourceIp = ngx.var.remote_addr,
            userAgent = headers["user-agent"] or ""
          },
          requestId = "local-" .. ngx.now(), stage = "$default",
          routeKey = ngx.var.request_method .. " " .. route_path,
          time = os.date("!%d/%b/%Y:%H:%M:%S +0000"),
          timeEpoch = ngx.now() * 1000
        },
        body = body ~= "" and body or nil,
        isBase64Encoded = false
      })
    }

    proxy_pass http://$target:8080/2015-03-31/functions/function/invocations;
    proxy_method POST;
    proxy_set_header Content-Type application/json;
    proxy_set_body $lambda_event_json;
    proxy_http_version 1.1;

    body_filter_by_lua_block {
      local cjson = require "cjson"
      if not ngx.arg[2] then return end
      local ok, resp = pcall(cjson.decode, ngx.arg[1])
      if not ok or type(resp) ~= "table" or not resp.statusCode then return end
      ngx.status = resp.statusCode
      if resp.headers then for k, v in pairs(resp.headers) do ngx.header[k] = v end end
      local body = resp.body or ""
      if resp.isBase64Encoded then body = ngx.decode_base64(body) end
      ngx.arg[1] = body
    }
  }

  location = / {
    default_type application/json;
    return 200 '{"routes": [${routeList}]}';
  }
  
  location / {
    default_type application/json;
    return 404 '{"error": "Route not found"}';
  }
}`
}

/**
 * Generate the gateway service with inline Dockerfile containing nginx config
 */
function generateGatewayService(serverless: ServerlessConfig): DockerService {
  const nginxConfig = generateNginxConfig(serverless)
  const functionNames = Object.keys(serverless.functions)

  // Escape $ as $$$$ for both YAML library and Docker Compose interpolation
  // yaml.stringify() will convert $$$$ -> $$ in the YAML file
  // Docker Compose (when reading from file) will convert $$ -> $
  const escapedConfig = nginxConfig.replace(/\$/g, '$$$$')

  return {
    build: {
      context: '.',
      dockerfile_inline: `FROM openresty/openresty:alpine
RUN cat <<'EOF' > /etc/nginx/conf.d/default.conf
${escapedConfig}
EOF
EXPOSE 80
CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]`,
    },
    ports: ['9000:80'],
    depends_on: functionNames.map(toServiceName),
  }
}

/**
 * Generate a Lambda service from a serverless function definition
 */
function generateLambdaService(
  functionName: string,
  func: ServerlessFunction,
  serverless: ServerlessConfig,
  zipLambdaBuild: BuildConfig,
): DockerService {
  // Check if this is a container-based function (has image) or zip-based (has handler)
  const isContainerBased = !!func.image

  const service: DockerService = {
    expose: ['8080'],
    environment: ['NODE_ENV=development'],
  }

  if (isContainerBased && func.image) {
    // Container-based Lambda: use the specific Dockerfile from ECR config
    const imageName = func.image.name
    const imageConfig = serverless.provider.ecr?.images?.[imageName]

    if (imageConfig) {
      service.build = {
        context: imageConfig.path || '.',
        dockerfile: imageConfig.file || `src/functions/${functionName}/Dockerfile`,
        ...(imageConfig.buildArgs ? { args: imageConfig.buildArgs } : {}),
      }
    }
  } else {
    // Zip-based Lambda: reuse the shared build object
    service.build = zipLambdaBuild
    // Set command in docker-compose instead of Dockerfile to avoid interpolation issues
    service.command = [`dist/${functionName}/${functionName}.handler`]
  }

  return service
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Factories
// ─────────────────────────────────────────────────────────────────────────────

function createWatchConfig(): WatchConfig[] {
  return [
    {
      action: 'sync+restart',
      path: './dist/',
      target: '/var/task/dist/',
    },
    {
      action: 'sync+restart',
      path: './package.json',
      target: '/var/task/package.json',
    },
  ]
}

function createZipLambdaBuild(): BuildConfig {
  return {
    context: '.',
    dockerfile_inline: `FROM public.ecr.aws/lambda/nodejs:24

# Copy built code (same as what goes in zip)
COPY package*.json ./
COPY dist/ ./dist/`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a Docker Compose configuration from a Serverless config
 */
export function generateComposeFile(serverless: ServerlessConfig): DockerComposeFile {
  const watchConfig = createWatchConfig()
  const zipLambdaBuild = createZipLambdaBuild()

  const compose: DockerComposeFile = {
    'x-lambda-watch': watchConfig,
    'x-zip-lambda-build': zipLambdaBuild,
    services: {
      gateway: generateGatewayService(serverless),
    },
  }

  // Add Lambda services - reuse the same watch config and build objects
  for (const [functionName, func] of Object.entries(serverless.functions)) {
    const serviceName = toServiceName(functionName)
    const service = generateLambdaService(functionName, func, serverless, zipLambdaBuild)
    // Use the same watch config reference
    service.develop = { watch: watchConfig }
    compose.services[serviceName] = service
  }

  return compose
}
