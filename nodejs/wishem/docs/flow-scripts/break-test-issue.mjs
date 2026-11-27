// Usage: node break-test-issue.mjs <package> <change issue> <milestone number> <commit range> <file>...
// Creates the issue of a break-test, gives it the type Review, and adds it to the two projects. Prints its number.
import { execFileSync } from 'node:child_process'

const [pkg, change, milestone, range, ...files] = process.argv.slice(2)
const env = { ...process.env, GH_ORG: 'twin-digital' }
const gh = (args, input) => execFileSync('gh', args, { env, input, encoding: 'utf8' }).trim()
const api = (method, path, body) =>
  JSON.parse(
    gh(['api', '--method', method, `repos/twin-digital/opus/${path}`, '--input', '-'], JSON.stringify(body ?? {})),
  )

const issue = api('POST', 'issues', {
  title: `Break-test: \`${pkg}\` after #${change}`,
  labels: ['app:wishem'],
  milestone: Number(milestone),
  body: `A break-test of the code that #${change} changed in \`@thrashplay/wishem-${pkg}\`. The rules are in the section "Break-tests" of [\`autonomous-flow.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/autonomous-flow.md) and in [\`break-test-rules.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/break-test-rules.md).

## Scope

- Range of commits: \`${range}\`
- Source files:
${files.map((file) => `  - \`${file}\``).join('\n')}
- The tests that the change added or changed for these files.

## Result

- A pull request that changes tests only, with the totals of the two passes in its description.
- One issue of the type \`Bug\` for each fault of the source that the break-test finds.`,
})
api('PATCH', `issues/${issue.number}`, { type: 'Review' })
gh(['project', 'item-add', '6', '--owner', 'twin-digital', '--url', issue.html_url, '--format', 'json', '--jq', '.id'])
gh(['project', 'item-add', '5', '--owner', 'twin-digital', '--url', issue.html_url, '--format', 'json', '--jq', '.id'])
console.log(issue.number)
