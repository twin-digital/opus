🧠 TODO: Dev Infra Follow-Ups

    For when you inevitably hit flow state, forget everything, and need a breadcrumb trail back to sanity.

🔗 Aliases / TS Paths

Add paths to tsconfig.base.json to clean up import hell:

"paths": {
"@pkg/_": ["packages/_/src"],
"@app/_": ["apps/_/src"]
}

Update Vitest config (if needed) to support alias resolution.

Update ESLint and Prettier (if using import/order or sort rules).

    Consider path mapping in tsup if bundling packages with aliases.

📦 Versioning Strategy

Choose one (or both, if you hate yourself later):
Option A: changesets (recommended if you plan to publish to npm/private registry)

Install @changesets/cli

Set up .changeset/ folder

Add release script (changeset version && pnpm install && changeset publish)

    Bonus: CI release step

Option B: Git tag-based semver (chaotic good, internal use)

Use pnpm publish --filter=@pkg/sdk manually

Tag releases manually (git tag -a v0.1.0 -m "initial sdk" etc)

    Add changelog tooling if desired (e.g. standard-version, release-it)

📖 README in Each Project

Add a minimal README.md to each apps/_ and packages/_

    Overview of what it does

    Usage instructions

    Dev commands (pnpm run build, dev, etc.)

    Environment variable notes (if needed)

    Optional: auto-generate READMEs via a script/template

🧼 Optional: Clean up

Create .prettierignore and .eslintignore if not done

Set up commitlint (if you care)

Add docs/setup.md with the "how to install, run, dev" info
