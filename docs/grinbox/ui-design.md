# Grinbox UI design

Implementation spec for the Grinbox web app. Covers sitemap, the
pages that matter most, cross-cutting components, style
conventions, and the few items still open for a later design pass.

Audience: the implementer of the Grinbox SPA. Assumes familiarity
with [architecture.md](architecture.md) and
[glossary.md](glossary.md). Visual reference for every decision
below — palette swatches, type ramp, component states, sidebar
widths — lives in [`style-guide.html`](style-guide.html); open it
in a browser to verify light and dark.

Not in scope here: exact button placements, copy, animation
timings, accessibility audits.

---

## Sitemap

Seven top-level areas, persistent left sidebar:

```
Dashboard           Landing + first-run checklist + activity summary
Inbox               Message browser, Message detail
Pipelines           Pipeline list, Pipeline detail, Operator editor
Accounts            Account list, Account detail, OAuth onboarding
Activity Log        Operational events: errors, Limit hits, retries
Settings            Limits, Notification credentials, About
Metrics             Placeholder; deferred at MVP
```

Primary mental model is **Account-first**: when the User asks
"what's happening with my work email?" they navigate via Account.
Inbox is the cross-Account default surface; the Account filter chip
is the primary slice. Pipelines are a configuration concern, not a
browsing surface.

---

## The five pages that matter most

These are the surfaces that determine whether the product feels
right. Effort here pays off the most.

### 1. Dashboard

Landing page; scannable in five seconds. A first-run checklist on
top plus a card grid below.

**First-run checklist** — auto-hides once all items complete:

- ☐ Add an Account
- ☐ Create a Pipeline
- ☐ Assign the Pipeline to the Account

Each item links to the surface that completes it. The checklist
serves both as onboarding (first launch) and as a recovery affordance
(if a user later deletes an Account or unassigns a Pipeline).

**Cards** — always visible:

- "Triages last 24h" — count + spark line
- "Notifications sent today" — count + breakdown by Pipeline
- Top Tag distributions for recent Messages (e.g., "12 high-urgency")
- Error/Limit-hit alerts — only rendered if non-zero
- Quick links: most recent Notify recipients, recent Operator edits

Numbers are the primary content. Charts secondary.

### 2. Inbox / Message browser

The centerpiece. The replacement for "SSH in and grep the State DB."

- Paginated table of recent Messages, across all Accounts by default
- **Search input** over from / subject / snippet (Inbox-only; no
  global search at MVP)
- Filter chips: Account, Pipeline, presence of specific Tags, date
  range, Triage status
- **Scope selector** (backend disposition): defaults to _In inbox_
  (`source_state = present`) so the list mirrors the live inbox;
  switch to _All messages_ or a specific disposition to surface
  archived / trashed / deleted Messages, whose rows are dimmed and
  carry a disposition badge. The default never appears in the URL.
- Columns: from, subject, snippet, current Tags (compact badges,
  truncated), latest Triage status, time
- Click row → Message detail

**Density**: comfortable. ~48px row height; ~15–20 rows visible at
1080p above the fold. Mailminder volume is ~200 messages/day, so
the User needs to scan a lot — but not so dense that chips and
status indicators get cramped.

**Tag chip overflow**: rows show the 3 highest-priority Tag chips
(priority taken from the producing Pipeline's tag-key registry
order), followed by a `+N` chip. The full Tag list lives on
Message detail.

Bulk actions and saved filters are post-MVP.

### 3. Message detail

The "why did Grinbox do that" page.

**Tabbed layout**:

- **Overview** — header (from / subject / date), Current Tags as a
  vertical list grouped by provenance (which Triage and Operator
  version produced each), actions (Replay; Snooze post-MVP)
- **Tags** — full Tag history across every Triage; each entry
  hoverable for full provenance and links to the exact Operator
  version that produced it
- **Triage history** — selectable list of every Triage that has run
  against this Message, most recent first. Selecting a Triage
  expands its Operator runs (status, duration, resource usage) and
  its chronological event log (Tag set, Resource op succeeded /
  limited / failed). The latest Triage is selected by default.

There is no separate `/triage/<id>` route. A Triage is always viewed
in the context of its Message.

**Replay** is plain: no confirmation modal. "Reset and replay"
(post-MVP) will require confirmation when it ships.

### 4. Pipeline detail + Operator editor

Where iteration happens. The Operator editor is the second
most-used surface after Inbox.

**Pipeline detail:**

- Header: name, description, "active on N Accounts"
- Operators: ordered list in topological order, with visual grouping
  indicators (e.g., a bracket on the left margin) clustering
  mutually-independent Operators
- Tag-key registry: read-only subsection, auto-derived from declared
  Operator outputs
- **Add Operator**: button opens a modal listing registered Operator
  types (LLM Tagger, Rule-based Tagger, Notify, Apply Category,
  Digest delivery, ...) with brief descriptions. Pick a type,
  configure it inline, save creates the Operator.
- **Edit Operator** on a row opens the Operator editor

No graph editor at MVP. A visual node editor is post-MVP; the
ordered-list-with-grouping form covers Pipelines up to ~8 Operators
comfortably.

**Operator editor** varies by Operator type:

- **Rule-based Tagger**: rule list with drag-to-reorder, add / edit
  / delete rows, output Tag key + enum, **side-by-side live preview
  pane** showing impact against recent Triages (left: editor;
  right: list of Messages whose output Tag value would change, with
  diff marker). The preview updates as rules are edited.
- **LLM Tagger**: prompt template editor (large textarea), input
  Tag config, output Tag config, model selection, sample Tags from
  recent runs
- **Action**: simpler config form per Action type

**Save flow**: atomic. Edits are local until Save. A sticky footer
within the editor container shows `● Unsaved changes` (amber) on
the left and `Cancel` / `Save` on the right; leaving the page while
dirty triggers a confirmation. Each save creates a new Operator
version.

Operator version history is **not surfaced in the UI at MVP**.
Versions still persist in the data model and are referenced by Tag
provenance, so the audit trail is preserved; only the
diff/restore/browse UI is deferred.

### 5. Accounts + OAuth onboarding

First-run experience and "add another mailbox" flow.

- **Account list**: each row shows provider, status, last poll,
  active Pipeline (or warning chip: "no Pipeline assigned — won't
  be triaged")
- **Add Account**: kicks off Gmail OAuth in a pop-up consent
  window (full mechanism in [oauth-flow.md](oauth-flow.md))
- **Account detail**: thin settings page only — change active
  Pipeline, change poll cadence, re-auth, delete. Browsing-by-Account
  happens via the Account filter chip on Inbox, not here.

---

## The other surfaces

Lighter than the five core pages, but still in scope at MVP.

### Activity Log

Operational events about Grinbox itself, distinct from Triage
events about a specific Message. Examples: Gmail fetch errors,
Pushover Limit hits, Operator runtime failures, retry attempts.

- Chronological feed, most recent first
- Filterable by severity and Resource
- Limit hits appear as first-class entries (e.g., "Pushover
  `send_notification` limited 4× in past hour"); the same hits also
  show in the Triage event log on Message detail
- Errors surfaced on the Dashboard alert card link into this view

### Settings

Single Settings route with a secondary internal sidebar:

- Limits
- Notification credentials
- About

Each subsection is its own sub-route under `/settings/<section>`.
The structure scales as new settings categories emerge.

### Metrics

Placeholder at MVP. The sidebar entry renders a "Coming soon"
empty state. Build out when usage and cost dashboards become
useful; until then the Dashboard alert card and the Activity Log
cover the operational visibility need.

---

## Cross-cutting components

These get used everywhere. Conventions to pre-decide:

| Component                | Specification                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tables**               | Pagination + sorting + filter chips (TanStack Table)                                                                                                                                       |
| **Forms**                | TanStack Form + Zod; inline error below field on blur (red-500 text + border); save via sticky footer                                                                                      |
| **Drag-reorder lists**   | For Rule editing                                                                                                                                                                           |
| **Tag chips**            | Pill; `key: value` with key in muted weight, value regular; color from `hash(key) % 8` of an 8-color palette; hover reveals provenance; dense rows show 3 highest-priority + `+N` overflow |
| **Status indicators**    | Colored dot + label — emerald `completed`, amber `partial` / limit-hit, red `failed`, pulsing zinc-400 `running`, zinc-300 `pending`, outline-only `skipped`                               |
| **Code blocks**          | For Rule expressions, error messages, prompt text                                                                                                                                          |
| **Diff display**         | For live preview ("would change urgency on 3 messages")                                                                                                                                    |
| **Charts**               | Line + bar for metrics (Recharts) — used post-MVP                                                                                                                                          |
| **Loading**              | Skeleton on first load (TanStack Query `isPending`); refetches (`isFetching`) are silent                                                                                                   |
| **Confirmation dialogs** | shadcn `AlertDialog`; destructive actions only (delete Operator / Pipeline / Account)                                                                                                      |
| **Empty states**         | `:)` headline + one-line guidance + primary action; covers first-run, "no Pipeline assigned," "no Triages yet"                                                                             |
| **Toast notifications**  | `sonner`, bottom-right; success/error feedback from mutations                                                                                                                              |
| **Sidebar nav**          | 240px expanded, 56px icon-only; user toggle; auto-collapses below `md`; secondary internal sidebar inside Settings                                                                         |
| **Search input**         | Inbox-only at MVP (over from/subject/snippet)                                                                                                                                              |
| **First-run checklist**  | Dashboard card; auto-hides when complete                                                                                                                                                   |

---

## Style conventions

| Decision             | Value                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Base palette         | Zinc (neutrals)                                                                                       |
| Light/dark mode      | Both; respects OS preference; user toggle                                                             |
| Accent (`--primary`) | Violet 500 in light mode, violet 600 in dark mode                                                     |
| Status colors        | Tailwind red / amber / emerald 500 — semantic, distinct from accent                                   |
| Sans font            | Inter                                                                                                 |
| Mono font            | JetBrains Mono — for Tag values, Rule expressions, IDs                                                |
| Type scale           | `text-3xl` page title · `text-xl` section · `text-base` subsection · `text-sm` body · `text-xs` muted |
| Density              | Comfortable — 48px Inbox row, 15–20 rows above the fold at 1080p                                      |
| Iconography          | Lucide (`layout-dashboard`, `inbox`, `workflow`, `mail`, `activity`, `settings`, `bar-chart-3`)       |
| Responsive scope     | Desktop-first; layout degrades below `md` (768px) but remains functional                              |
| Animation            | Minimal — transitions on hover/state, no decorative motion                                            |
| Empty-state tone     | Quietly helpful with one warm beat (matches the "grin" branding)                                      |
| Error tone           | Direct + actionable ("Couldn't reach Gmail. [Retry]"); no blame                                       |

Open [`style-guide.html`](style-guide.html) in a browser for the
concrete rendering of every value above.

---

## MVP vs post-MVP

| Surface          | MVP                                                                                                                             | Post-MVP                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Dashboard        | First-run checklist + tile-based summary                                                                                        | Customizable widgets                                               |
| Inbox            | Filter chips, search, drill-down, comfortable density                                                                           | Bulk actions, saved filters                                        |
| Message detail   | Tabbed (Overview / Tags / Triage history)                                                                                       | Snooze, reset-and-replay with confirmation, Tag feedback           |
| Pipelines        | Ordered list with grouping indicators, Add Operator modal, Rule-based + LLM editors with side-by-side live preview, atomic save | Visual graph editor, Pipeline templates, clone, version history UI |
| Accounts + OAuth | Add Gmail, swap Pipeline, thin Account detail                                                                                   | Add IMAP, multi-User UI                                            |
| Activity Log     | Chronological event feed with severity/Resource filters                                                                         | Per-event drill-down, push notifications for new events            |
| Settings         | Internal sidebar with Limits / Notification credentials / About                                                                 | Auth, user profile, dedicated Limits-management page               |
| Metrics          | Placeholder route, "Coming soon" empty state                                                                                    | Time-series of cost + key counts; per-Operator drill-downs; alerts |

---

## Still open

Items deferred to future design passes:

1. **Error vocabulary style guide** — error messages reach the User
   via toasts, inline validation, modals, and the Triage event log.
   Once the tone is exercised in practice across all four surfaces,
   do a pass to lock consistent wording.

---

## Implementation order

The shortest path to a usable Grinbox:

1. **Sidebar + routing shell** — all seven top-level routes, theme
   toggle wired up, empty pages.
2. **Accounts + OAuth onboarding** — without an Account the rest is
   unreachable. Account list, Add Account flow, thin Account detail.
3. **Pipeline detail + Add Operator modal + Rule-based Tagger
   editor** — enough to define the first Pipeline. LLM Tagger
   editor and Action editors follow.
4. **Inbox + Message detail** — read-side surfaces over the State
   DB. Tabs on Message detail unlock the "why did Grinbox do that"
   debugging loop.
5. **Dashboard** — first-run checklist plus the card grid, against
   real data from steps 2–4.
6. **Activity Log** — operational visibility once there's enough
   running to produce events worth surfacing.
7. **Settings** — last; mostly stubs at MVP.
