# @grinbox/web

grinbox's browser application: the whole of what a user does with grinbox —
adding a mailbox, building a pipeline, reading what a triage concluded,
adjusting a cap, re-examining a message. It is one client of the daemon's HTTP
API with no privileged path of its own.

React and vite, with TanStack Router and Query, Radix primitives, and Tailwind.

## Typed from the daemon's routes

`src/lib/api.ts` builds a `hc<ApiRoutes>` client over `@grinbox/server`'s
exported route type, so a change to a route's shape is a compile error here
rather than a runtime surprise. That import is type-only and erased at build:
the shipped bundle carries no server code.

The value shapes inside those requests and responses — the closed enums, the
operator configurations, the refusal envelope, the model set — come from
`@grinbox/shared`, which both tiers import. Neither is redeclared here.

## Development

```
pnpm dev        # vite dev server
pnpm test       # vitest, jsdom
pnpm build      # vite build → dist/
```

`VITE_API_BASE` points the client at a daemon on another origin during
development. In a deployment the daemon serves these assets itself, so the API
is same-origin and the variable is unset.

## Installing a release

`pnpm release-assets` builds `grinbox-web-<version>.tar.gz`, attached to this
package's GitHub release beside a `SHA256SUMS`. It holds a single `web/`
directory, which unpacks beside the daemon's `server/` — that is where the
daemon looks for the interface unless `GRINBOX_WEB_DIST` says otherwise.

The build is self-contained: fonts are bundled, so the page renders without
reaching the internet, which matters because grinbox is deployed on a private
network.

A deployment needs this artifact _and_ the daemon's, at the same version. See
`@grinbox/server`'s README for the full layout — and note that the two are not
independently choosable, since this application is compiled against a specific
version of the daemon's routes.
