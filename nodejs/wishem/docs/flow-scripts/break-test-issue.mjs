// Usage: node break-test-issue.mjs <change issue> <milestone number> --pr <pull request number> <file>...
//    or: node break-test-issue.mjs <change issue> <milestone number> <commit range> <file>...
// With --pr, the script reads the merge commit of the merged pull request and uses the range `<sha>~1..<sha>`.
// With --dry, the script prints the title and the body of the issue and creates nothing.
// Creates the one break-test issue of a change, gives it the type Review, and adds it to the two projects. Prints its number.
// Each file is a source file of a library package (nodejs/wishem/<package>/...); the issue groups the files by package.
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { pr: { type: 'string' }, dry: { type: 'boolean', default: false } },
})
const [change, milestone, ...rest] = positionals
const rangeGiven = values.pr === undefined
const files = rangeGiven ? rest.slice(1) : rest
let range = rangeGiven ? rest[0] : undefined
if (!change || !milestone || (rangeGiven && !range) || files.length === 0) {
  console.error(
    'usage: node break-test-issue.mjs <change issue> <milestone number> (--pr <pull request number> | <commit range>) [--dry] <file>...',
  )
  process.exit(2)
}
const env = { ...process.env, GH_ORG: 'twin-digital' }
const gh = (args, input) => execFileSync('gh', args, { env, input, encoding: 'utf8' }).trim()
const api = (method, path, body) =>
  JSON.parse(
    gh(['api', '--method', method, `repos/twin-digital/opus/${path}`, '--input', '-'], JSON.stringify(body ?? {})),
  )

if (!rangeGiven) {
  const merge = JSON.parse(
    gh(['api', `repos/twin-digital/opus/pulls/${values.pr}`, '--jq', '{merged, sha: .merge_commit_sha}']),
  )
  if (!merge.merged || !merge.sha) {
    console.error(`pull request ${values.pr} is not merged`)
    process.exit(1)
  }
  range = `${merge.sha}~1..${merge.sha}`
}

const byPackage = new Map()
for (const file of files) {
  const pkg = /^nodejs\/wishem\/([^/]+)\//.exec(file)?.[1]
  if (!pkg) {
    console.error(`not a file of a Wishem package: ${file}`)
    process.exit(2)
  }
  byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), file])
}
const scope = [...byPackage]
  .map(([pkg, list]) => `- \`@thrashplay/wishem-${pkg}\`:\n${list.map((file) => `  - \`${file}\``).join('\n')}`)
  .join('\n')

const title = `Break-test: after #${change}`
const body = `A break-test of the code that #${change} changed in its library packages: ${[...byPackage.keys()].map((pkg) => `\`${pkg}\``).join(', ')}. The rules are in the section "Break-tests" of [\`autonomous-flow.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/autonomous-flow.md) and in [\`break-test-rules.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/break-test-rules.md). Run the mutants of one package at a time.

## Scope

- Range of commits: \`${range}\`
- Source files:
${scope}
- The tests that the change added or changed for these files.

## Result

- One pull request that changes tests only, with the totals of the two passes for each package in its description.
- One issue of the type \`Bug\` for each fault of the source that the break-test finds.`
if (values.dry) {
  console.log(`${title}\n\n${body}`)
  process.exit(0)
}
const issue = api('POST', 'issues', { title, labels: ['app:wishem'], milestone: Number(milestone), body })
api('PATCH', `issues/${issue.number}`, { type: 'Review' })
gh(['project', 'item-add', '6', '--owner', 'twin-digital', '--url', issue.html_url, '--format', 'json', '--jq', '.id'])
gh(['project', 'item-add', '5', '--owner', 'twin-digital', '--url', issue.html_url, '--format', 'json', '--jq', '.id'])
console.log(issue.number)
