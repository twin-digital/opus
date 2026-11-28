// Usage: node break-test-issue.mjs --milestone <number> --package <name> --pr <n> [--pr <n> ...] [--dry] <file>...
//    or: node break-test-issue.mjs <change issue> <milestone number> --pr <pull request number> <file>...
//    or: node break-test-issue.mjs <change issue> <milestone number> <commit range> <file>...
// The script refuses a range that is not `<sha>..<sha>` or `<sha>~1..<sha>`, a file that does not exist at the end commit, and a number that is not a number.
// With --pr, the script reads the merge commit of the merged pull request and uses the range `<sha>~1..<sha>`.
// With --dry, the script prints the title and the body of the issue and creates nothing.
// With --milestone, the script creates the one break-test issue of a library package for a milestone: it reads the merge commit of each merged pull request and lists the range `<sha>~1..<sha>` of each one.
// The script refuses a pull request that is not merged, and a file that exists neither on a merge commit nor on origin/main.
// Creates the one break-test issue of a change or of a library package of a milestone, gives it the type Review, and adds it to the two projects. Prints its number.
// Each file is a source file of a library package (nodejs/wishem/<package>/...); the issue groups the files by package.
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    pr: { type: 'string', multiple: true },
    milestone: { type: 'string' },
    package: { type: 'string' },
    dry: { type: 'boolean', default: false },
  },
})
const forMilestone = values.milestone !== undefined
const [change, milestone, ...rest] = forMilestone ? [undefined, values.milestone, ...positionals] : positionals
const rangeGiven = !forMilestone && values.pr === undefined
const files = rangeGiven ? rest.slice(1) : rest
let range = rangeGiven ? rest[0] : undefined
const fail = (message) => {
  console.error(message)
  process.exit(2)
}
const sha = '[0-9a-f]{7,40}'
if (forMilestone) {
  const prs = values.pr ?? []
  if (!values.package || prs.length === 0 || positionals.length === 0) {
    fail(
      'usage: node break-test-issue.mjs --milestone <number> --package <name> --pr <n> [--pr <n> ...] [--dry] <file>...',
    )
  }
  if (!/^\d+$/.test(values.milestone)) fail(`the milestone is not a number: ${values.milestone}`)
  for (const pr of prs) if (!/^\d+$/.test(pr)) fail(`the pull request is not a number: ${pr}`)
  if (!/^[a-z0-9-]+$/.test(values.package)) fail(`not a package name: ${values.package}`)
}
if (range !== undefined && !new RegExp(`^${sha}(~1)?\\.\\.${sha}$`).test(range)) {
  fail(`not a commit range of the form <sha>..<sha> or <sha>~1..<sha>: ${range}`)
}
if (!forMilestone && (!change || !milestone || (rangeGiven && !range) || files.length === 0)) {
  fail(
    'usage: node break-test-issue.mjs <change issue> <milestone number> (--pr <pull request number> | <commit range>) [--dry] <file>...',
  )
}
if (!forMilestone && !/^\d+$/.test(change)) fail(`the change issue is not a number: ${change}`)
if (!/^\d+$/.test(milestone)) fail(`the milestone is not a number: ${milestone}`)
if (!forMilestone && !rangeGiven && !/^\d+$/.test(values.pr[0]))
  fail(`the pull request is not a number: ${values.pr[0]}`)
const env = { ...process.env, GH_ORG: 'twin-digital' }
const gh = (args, input) => execFileSync('gh', args, { env, input, encoding: 'utf8' }).trim()
const api = (method, path, body) =>
  JSON.parse(
    gh(['api', '--method', method, `repos/twin-digital/opus/${path}`, '--input', '-'], JSON.stringify(body ?? {})),
  )

const exists = (commit, file) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}:${file}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const mergeOf = (pr) => {
  const merge = JSON.parse(
    gh(['api', `repos/twin-digital/opus/pulls/${pr}`, '--jq', '{merged, sha: .merge_commit_sha}']),
  )
  if (!merge.merged || !merge.sha) {
    console.error(`pull request ${pr} is not merged`)
    process.exit(forMilestone ? 2 : 1)
  }
  return merge.sha
}

let ranges = []
if (forMilestone) {
  ranges = values.pr.map((pr) => ({ pr, sha: mergeOf(pr) }))
} else if (!rangeGiven) {
  const merged = mergeOf(values.pr[0])
  range = `${merged}~1..${merged}`
}

const byPackage = new Map()
for (const file of files) {
  const pkg = /^nodejs\/wishem\/([^/]+)\//.exec(file)?.[1]
  if (!pkg) {
    fail(`not a file of a Wishem package: ${file}`)
  }
  if (forMilestone) {
    if (pkg !== values.package) fail(`the file is not in the package ${values.package}: ${file}`)
    if (!ranges.some(({ sha }) => exists(sha, file)) && !exists('origin/main', file)) {
      fail(`the file does not exist on a merge commit or on origin/main: ${file}`)
    }
  } else {
    const end = range.split('..')[1]
    if (!exists(end, file)) fail(`the file does not exist at commit ${end}: ${file}`)
  }
  byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), file])
}
const scope = [...byPackage]
  .map(([pkg, list]) => `- \`@thrashplay/wishem-${pkg}\`:\n${list.map((file) => `  - \`${file}\``).join('\n')}`)
  .join('\n')

const rules = `The rules are in the section "Break-tests" of [\`autonomous-flow.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/autonomous-flow.md) and in [\`break-test-rules.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/break-test-rules.md).`
const milestoneBody =
  () => `A break-test of the library package \`${values.package}\`, for the milestone ${milestone}. ${rules}

## Scope

- The source lines of the files below that the merged pull requests of the milestone changed, and the tests that these pull requests added or changed for these lines. Do not include a line that an earlier break-test covered.
- Pull requests and ranges of commits:
${ranges.map(({ pr, sha }) => `  - #${pr}: \`${sha}~1..${sha}\``).join('\n')}
- Source files:
${scope}

## Result

- One pull request that changes tests only, with the totals of the two passes in its description.
- One issue of the type \`Bug\` in the milestone for each fault of the source that the break-test finds.`
const title = forMilestone ? `Break-test: ${values.package} in milestone ${milestone}` : `Break-test: after #${change}`
const body =
  forMilestone ? milestoneBody() : (
    `A break-test of the code that #${change} changed in its library packages: ${[...byPackage.keys()].map((pkg) => `\`${pkg}\``).join(', ')}. The rules are in the section "Break-tests" of [\`autonomous-flow.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/autonomous-flow.md) and in [\`break-test-rules.md\`](https://github.com/twin-digital/opus/blob/main/nodejs/wishem/docs/break-test-rules.md). Run the mutants of one package at a time.

## Scope

- Range of commits: \`${range}\`
- Source files:
${scope}
- The tests that the change added or changed for these files.

## Result

- One pull request that changes tests only, with the totals of the two passes for each package in its description.
- One issue of the type \`Bug\` for each fault of the source that the break-test finds.`
  )
if (values.dry) {
  console.log(`${title}\n\n${body}`)
  process.exit(0)
}
const issue = api('POST', 'issues', { title, labels: ['app:wishem'], milestone: Number(milestone), body })
api('PATCH', `issues/${issue.number}`, { type: 'Review' })
gh(['project', 'item-add', '6', '--owner', 'twin-digital', '--url', issue.html_url, '--format', 'json', '--jq', '.id'])
gh(['project', 'item-add', '5', '--owner', 'twin-digital', '--url', issue.html_url, '--format', 'json', '--jq', '.id'])
console.log(issue.number)
