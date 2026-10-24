// Upsert a PR comment describing the preview deployment for a stage.
//
// Called by deploy-preview.yaml after a successful `serverless deploy`. Reads the deployed
// CloudFormation stacks for the stage (AWS creds persist in the job from the deploy step), pulls each
// service's public HTTP endpoint from its stack outputs, and posts a single, self-updating PR comment
// (found via a hidden marker) so repeated deploys edit one comment instead of appending.
//
// Purely cosmetic: any failure is downgraded to a warning and exits 0 so it never fails the deploy.
//
// Env: GH_TOKEN, GITHUB_API_URL, REPO (owner/repo), PR, STAGE, SHA, AWS_REGION, RUN_URL.

import { execFileSync } from 'node:child_process'

const MARKER = '<!-- preview-deploy -->'
// Matches an AWS-generated HTTP API / API Gateway base URL in a stack output value.
const ENDPOINT_RE = /https:\/\/[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com/i

const env = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env var ${name}`)
  return value
}

/** Select this stage's stacks from `describe-stacks` JSON and extract each service's endpoint (if any). */
export const parseStacks = (describeJson, stage) => {
  const suffix = `-${stage}`
  return (JSON.parse(describeJson).Stacks ?? [])
    .filter((s) => s.StackName.endsWith(suffix) && !s.StackStatus.startsWith('DELETE_'))
    .map((s) => {
      const endpoint = (s.Outputs ?? []).map((o) => o.OutputValue?.match(ENDPOINT_RE)?.[0]).find(Boolean)
      return { service: s.StackName.slice(0, -suffix.length), endpoint }
    })
    .sort((a, b) => a.service.localeCompare(b.service))
}

/** Describe every stack for this stage and extract each service's public endpoint (if any). */
const collectServices = (stage, region) => {
  const raw = execFileSync('aws', ['cloudformation', 'describe-stacks', '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return parseStacks(raw, stage)
}

export const buildBody = ({ stage, sha, runUrl, services }) => {
  const lines = [
    MARKER,
    '### 🔎 Preview deployment',
    '',
    `**Stage:** \`${stage}\` · **Commit:** \`${sha.slice(0, 7)}\` · [deploy run](${runUrl})`,
    '',
  ]
  if (services.length === 0) {
    lines.push('_No deployed stacks found for this stage yet._')
  } else {
    lines.push('| Service | Endpoint |', '| --- | --- |')
    for (const { service, endpoint } of services) {
      lines.push(`| \`${service}\` | ${endpoint ? `<${endpoint}>` : '_no public endpoint_'} |`)
    }
  }
  lines.push('', '<sub>Updated automatically on each preview deploy.</sub>')
  return lines.join('\n')
}

const gh = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(`${env('GITHUB_API_URL')}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env('GH_TOKEN')}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GitHub ${method} ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

/** Find this workflow's existing comment (by marker) so we edit it instead of posting a duplicate. */
const findExisting = async (repo, pr) => {
  for (let page = 1; ; page++) {
    const comments = await gh(`repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`)
    const match = comments.find((c) => c.body?.includes(MARKER))
    if (match) return match
    if (comments.length < 100) return undefined
  }
}

const main = async () => {
  const repo = env('REPO')
  const pr = env('PR')
  const body = buildBody({
    stage: env('STAGE'),
    sha: env('SHA'),
    runUrl: env('RUN_URL'),
    services: collectServices(env('STAGE'), env('AWS_REGION')),
  })

  const existing = await findExisting(repo, pr)
  if (existing) {
    await gh(`repos/${repo}/issues/comments/${existing.id}`, { method: 'PATCH', body: { body } })
    console.log(`Updated preview comment ${existing.id} on PR #${pr}.`)
  } else {
    await gh(`repos/${repo}/issues/${pr}/comments`, { method: 'POST', body: { body } })
    console.log(`Posted preview comment on PR #${pr}.`)
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    // Cosmetic step — never fail the deploy over a comment.
    console.log(`::warning::preview-comment: ${error instanceof Error ? error.message : String(error)}`)
  }
}
