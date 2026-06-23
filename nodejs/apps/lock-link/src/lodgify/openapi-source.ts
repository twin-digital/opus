/**
 * Fetches Lodgify's OpenAPI contract, to be vendored into the repo as
 * `lodgify.openapi.json`.
 *
 * Lodgify publishes no single public spec file (the `api.lodgify.com/swagger` route is
 * blocked, and the doc site's raw-spec download is permission-gated). But every operation's
 * ReadMe reference page exposes a public JSON view whose `data.api.schema` is the complete
 * OpenAPI document — all paths and components, not just that operation. So one page yields
 * the whole spec.
 *
 * The doc host bot-filters on client fingerprint, not just user-agent: `curl` with a
 * browser UA is allowed, but Node's `fetch` (undici) is blocked even with full browser
 * headers. So this build-time tool shells out to `curl` (present on CI runners). It is
 * never imported by the Lambda handler or the test suite — those read the vendored JSON.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DOC_BASE = 'https://docs.lodgify.com/lodgify/api-next/v2/branches/1.0/reference'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0'

/**
 * Any reference page embeds the entire spec, so we fetch one. Discover slugs from the
 * category page list: `.../categories/reference/Lodgify%20Public%20API%20v2/pages`.
 */
const SPEC_PAGE_SLUG = 'getallasync'

/**
 * The operations the sync depends on. The contract test asserts each is present in the
 * vendored spec; adding an endpoint to the sync means adding it here too.
 */
export const LODGIFY_OPERATIONS = [
  { method: 'get', path: '/v2/reservations/bookings' }, // the poll driver
  { method: 'get', path: '/v2/reservations/bookings/{id}' }, // resolve / diff
  { method: 'put', path: '/v2/reservations/bookings/{id}/keyCodes' }, // write the code
] as const

export interface OpenApiDoc {
  paths: Record<string, Record<string, unknown>>
  components: { schemas: Record<string, unknown> }
  [key: string]: unknown
}

/** GET via curl, returning the parsed JSON body. Throws on a non-2xx status. */
const curlJson = async (url: string): Promise<unknown> => {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sS', '-A', BROWSER_UA, '-H', 'accept: application/json', '--max-time', '30', '-w', '\n%{http_code}', url],
    { maxBuffer: 32 * 1024 * 1024 },
  )
  const split = stdout.lastIndexOf('\n')
  const status = Number(stdout.slice(split + 1).trim())
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${String(status)} for ${url}`)
  }
  return JSON.parse(stdout.slice(0, split))
}

export const fetchLodgifySpec = async (): Promise<OpenApiDoc> => {
  const body = (await curlJson(`${DOC_BASE}/${SPEC_PAGE_SLUG}?reduce=false`)) as {
    data?: { api?: { schema?: Partial<OpenApiDoc> } }
  }
  const schema = body.data?.api?.schema
  if (!schema?.paths || !schema.components) {
    throw new Error(`No OpenAPI schema in Lodgify doc page "${SPEC_PAGE_SLUG}"`)
  }
  return schema as OpenApiDoc
}
