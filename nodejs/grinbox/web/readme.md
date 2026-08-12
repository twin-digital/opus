# @grinbox/web

Grinbox's browser application: the interface the user configures and inspects grinbox through.

It is a client of the daemon's HTTP API and nothing more — there is no privileged path, no
second service, and no route it can reach that another client of the API could not
(`d-ti7vexo3`). The daemon serves the built asset tree from its own process, so running grinbox
takes only grinbox (`r-zpdecb2z`).

## How it is typed

The API client is `hc<ApiRoutes>` over `@grinbox/server`'s exported route type, so a change to a
route's shape is a compile error here rather than a runtime surprise (`d-5l0wqcj0`). The
`@grinbox/server` import is type-only and erased at build; no server code reaches the bundle.

The value vocabulary both tiers share — the operator configuration schemas, the match and
template grammars, the offered models, the refusal envelope — comes from `@grinbox/shared`. The
envelopes around it are inferred from the routes (`d-qrxtbcei`). Nothing is declared twice.

## The areas

The interface opens on a summary of what grinbox has been doing, with the message browser as one
area beside it rather than the landing page (`d-1uo9p5wq`):

| route        | what it is                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `/`          | the dashboard — recent volume, what needs attention, what remains to be set up                    |
| `/inbox`     | the message browser, paged and filtered; `/inbox/$messageId` is one message's full triage history |
| `/pipelines` | the operator editors, one per shipped type, with a live preview on the rule-based tagger          |
| `/accounts`  | mailboxes: authorization, poll cadence, and which pipeline is active                              |
| `/activity`  | the chronological feed of failures, cap denials, and configuration edits                          |
| `/settings`  | caps, notification cooldowns and credentials, and the build the daemon is running                 |

## Notification kinds and cooldowns

A notify operator may name a notification kind — a short label grouping pushes that should not
pile up (`d-vn2jdxbs`); the field is optional in the operator editor and omitted from the saved
configuration when blank. Settings → Notification cooldowns holds the per-kind minimum interval
(`d-k3wq81vn`): whole seconds, at least one (`d-t6mhv3aq`), freely set, changed, and removed —
unlike the seeded caps on the Limits page, every cooldown is the user's own (`d-6ptxams7`). The
kind is fixed when a cooldown is created; renaming one is delete + create.

A push suppressed by a cooldown is an outcome, not a failure (`d-5amonj40`): the run and its
triage render completed, and the message detail shows the suppression, its kind, and the run
whose push it deferred to (`d-e9jslw4x`). The reference resolves to that run's triage — selected
in place when it belongs to the same message, linked to the other message's detail (landing on
that triage via `?triage=`) otherwise. Where the deferred-to triage no longer exists, the
identifiers render as text.

## Delayed archives

An archive operator takes an optional delay — whole seconds, at least one, no ceiling
(`d-grcdd4ov`). Left blank, the field is omitted from the saved configuration and the message is
archived during the triage the operator runs in; filled, the triage schedules the archive for
that many seconds after the message arrived, so mail that is useful when it lands and worthless
soon after leaves the inbox on its own (`r-cwc01n0t`). Clearing the field drops it rather than
storing a zero, as the cooldown interval behaves.

A message holds at most one pending archive (`d-0tajzoy7`), and every read surface carries it
while it stands (`d-p0ea1t8q`): the inbox row shows the countdown, and message detail states the
due moment, names the triage that recorded it — selecting that triage in the history — and says
that replaying the message cancels or replaces what is pending. Nothing filters or sorts on it.
A due moment already past reads "due now": the sweep runs on grinbox's heartbeat, so past-due is
imminent rather than missed (`d-gzv0jty7`). The API omits a pending archive the moment it fires,
is cancelled, or is superseded, so what is shown is always still ahead.

What the delayed path did is readable on the triage that recorded it (`d-41v9yqvh`): the archive
run says what it scheduled instead of calling the mailbox, and the event log names the schedule
(the due moment and the delay) and, where the moment came and no call was made, why in
words — the message had already left the inbox, its pipeline or account was deleted, or its
pipeline is no longer active on the account.

## Money in display form

Wherever a tag's value is shown — inbox chips, the message detail's tags and events — a key the
pipeline's enabled operators type as extracted money renders in display form (`d-u4gpx6ke`),
through the same `formatMoneyDisplay` the digest uses, so `19503:USD` reads `$195.03` and an
unknown-symbol currency leads with its ISO code (`CHF 1,234.56`). A stored value that is not
money renders verbatim (`d-m6ingqyv`), and what the user types when configuring — a digest
highlight threshold — stays in the stored form.

## Working on it

```
pnpm dev          # vite dev server; set VITE_API_BASE for a split-origin daemon
pnpm build        # vite build → dist/ (index.html + hashed assets/)
pnpm test         # vitest, jsdom + Testing Library
pnpm typecheck
pnpm lint
```

`dist/` is what the release bundle carries and what the daemon serves. It is self-contained:
fonts are bundled rather than fetched, so the page renders correctly with no egress from the
network grinbox is deployed on.

Per-package build settings live in `vite.config.d/` and `vitest.config.d/` fragments — the
`vite.config.ts` and `vitest.config.ts` at the package root are generated by `pnpm sync` and are
not edited by hand.
