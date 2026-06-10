# Grinbox — open issues

Running list of app-level bugs, gaps, and rough edges found in use. Deployment
/ infra issues live in [`docs/grinbox-deployment-open-issues.md`](../../../docs/grinbox-deployment-open-issues.md);
this file is the **application** tracker (operators, pipelines, UI, providers).

Each item: **Status** · symptom · root cause (if known) · proposed fix ·
workaround.

---

## I1 — LLM Tagger prompt does not include the message

**Status:** open (root cause known). Discovered 2026-06-02.

**Symptom.** An LLM-Tagger run whose `prompt_template` contained no field
placeholders produced model output like _"I don't see the email content…
please provide the From/Subject/snippet"_ — not a JSON object — so the run
failed (`model output … did not contain a JSON object`).

**Root cause.** The `prompt_template` is rendered by a placeholder engine
(`operators/built-ins/template.ts`): the message is injected only via
`{{from}}`/`{{to}}`/`{{subject}}`/`{{snippet}}`/`{{body}}` and `{{tag.<key>}}`.
There is **no auto-include** of the message. A template with no placeholders
sends the model the appended _"classify the message above…"_ framing with no
message above it. Two aggravating factors:

- **Unknown/misspelled placeholders render to the empty string silently** (no
  error) — `{{Body}}`, `{{email}}`, `{{message}}` all → "".
- **`{{body}}` is currently always empty**: the poller fetches Gmail
  `format=metadata` (`providers/live-gmail-client.ts`), so `messages.body_text`
  is never populated (the `body_text`/`body_html`/`body_fetched_at` columns
  exist — a lazy body-fetch is designed but not wired). Only `{{subject}}` /
  `{{snippet}}` carry content today.

**Proposed fix.**

- (a) **Auto-include the message** in `buildPrompt` (a `From/Subject/Snippet`
  block prepended server-side), so a field-less template still works — the
  operator already appends _"classify the message above,"_ which assumes the
  message is present. The user template becomes _additional_ guidance.
- (b) **Editor (`web/.../llm-editor.tsx`):** surface the available `{{…}}`
  variables (same gap just fixed for the rules editor) and lint when a template
  references none.
- (c) Mark `{{body}}` unavailable until full-body fetch is wired (or wire it).

**Workaround.** Put `{{subject}}` + `{{snippet}}` (and `{{from}}`) in the
`prompt_template`; don't rely on `{{body}}`.

---

## I2 — Operator DAG not ordering on tag dependencies (race)

**Status:** **FIXED** (committed 2026-06-02) — pending redeploy.
`contractFromConfig` now derives `inputs` (notify/apply_category lift
`when.tag_key`; rule_based_tagger extracts `tag.<key>` refs via the new shared
`extractTagRefs`), so edges form for both the UI and the executor; save-time
validation rejects a gate on a non-produced tag; an integration test drives the
real derivation + executor and asserts a gated notify waits for its producer.
**Deploy note:** no `code_version` bump was applied — populating `inputs`
changes ordering semantics, so the recommendation is to **redeploy when no
Triage is in flight** (the restart's recovery sweep settles `running` runs).
Bumping `notify`/`rule_based_tagger`/`apply_category` `code_version` 1→2 is the
stricter alternative (forces stale in-flight snapshots to fail rather than
re-order); deferred as unnecessary for this low-volume single-user install.

**Symptom.** A pipeline whose Notify/alert Operators gate on a tag (`kind`)
produced by an upstream `llm_tagger` renders in the UI with **all Operators in
parallel** (a single level), and a retriage that the LLM tagged `kind: alerts`
**sent no notification** — consistent with the Notify Operator running
before/concurrently with the tagger, so the gating tag isn't present yet.

**Root cause (confirmed).** Single defect, two symptoms.
`contractFromConfig` (`packages/shared/src/contract.ts`) **never populates
`Contract.inputs`** — it's initialized `[]` and the `switch` only ever pushes
to `outputs`; for `notify`/`apply_category` the case is an explicit no-op
("Actions declare no config-driven inputs in MVP"). Both consumers of the
contract then see an edgeless graph:

- the UI/topology (`http/api/pipelines.ts` `topoGroups`) forms an edge only when
  a consumer's `contract.inputs` key matches a producer's `contract.outputs` —
  with `inputs: []`, no edge ever forms → every Operator at level 0;
- the executor (`execution/resolve-contract.ts` → `classify-inputs.ts`) gates a
  run on those same `inputKeys`; empty → the run is immediately `satisfied` and
  dispatched, so all Operators run concurrently (bounded only by the worker
  pool). The executor _is_ built to serialize on edges — it's handed an edgeless
  graph, not ignoring edges.

So a `notify` whose `config.when.tag_key = "kind"` gates on a tag produced by the
`llm_tagger`, but that dependency is never lifted into `inputs`, so Notify races
ahead of the tagger and `tags.get("kind")` is empty at gate time → no
notification. **The UI-parallel display and the missing notification are the
same bug.** Confirmed live: `GET /api/pipelines/1` shows op 3 `llm-classify`
(outputs `kind`/`source_type`/`domain`/`intent`) and three `notify` ops (4/5/6)
gating on those keys, **all at `group: 0` with `inputs: []`**; the
`tag_key_registry` correctly attributes the keys to op 3 — the producer is known,
the edge just isn't derived.

**Fix direction.** Populate `inputs` in `contractFromConfig` (single source for
read API + executor, so one change fixes both symptoms; no operator-schema
change — the data is already in config):

- `notify` / `apply_category`: push `config.when.tag_key` into `inputs`.
- `rule_based_tagger`: extract `tag.<key>` refs from each rule's `match`. Needs a
  new exported `extractTagRefs(expr)` in `@twin-digital/grinbox-shared` `match-expression.ts`
  (only `compileMatch` is exposed today; the AST isn't reachable externally).
- `llm_tagger`: none for now (no config-driven tag inputs).

**Ripple / risks to handle in the fix:**

- The save-time validator (`pipeline/validation.ts` `deriveContract`) must change
  in lockstep with `contractFromConfig` (ideally both call the shared fn) so
  read/write/execute agree; once `when.tag_key` is a declared input, save-time
  "every referenced tag has a producer" enforcement kicks in — make a Notify
  gating on a non-existent key fail at _save_, not silently cascade-skip at run.
- Consider a `code_version` bump for `notify`/`rule_based_tagger` (this changes
  ordering semantics of any in-flight snapshot).
- **Separate latent gap:** `when.equals` values aren't validated against the
  producer's declared `value_enum` — a typo'd value silently gates off. (Also
  double-check the live gate: it's `equals: ["alert"]`; if the LLM/enum value is
  actually `alerts`, that mismatch would suppress the notification even after the
  ordering fix.) Track as **I3** if pursued.

---

## I3 — Gate `when.equals` values not validated against the producer's enum

**Status:** open (latent). Noted 2026-06-02 during I2.

**Symptom (latent).** A `notify`/`apply_category` `when.equals` value that isn't
a member of the producing tagger's declared `value_enum` silently never matches
— the action gates off with no error. (Also the reason to double-check the live
`push-alerts` gate: it's `when.equals: ["alert"]`; confirm the `llm_tagger`'s
`kind` enum value is `alert`, not `alerts`, or the notification stays suppressed
even after I2.)

**Proposed fix.** At save time (now that gate keys are declared inputs with a
known producer — see I2), validate each `when.equals` value against the
producer Operator's `value_enum` for that key; reject unknown values.

---

## I4 — Template `{{tag.<key>}}` references not lifted into Contract inputs (I2 continuation)

**Status:** **FIXED** (committed 2026-06-02) — pending redeploy.
`contractFromConfig` now also unions `{{tag.<key>}}` refs from template fields
(`message_template`/`category_template`/`prompt_template`) into `inputs` via the
new shared `extractTemplateTagRefs` (the `{{…}}` grammar has one shared source
now, so renderer and extractor can't drift); save-time validation rejects a
template ref to a non-produced tag; an integration test confirms a
template-only dependency is held until its producer settles and renders the real
value. The seed-demo bare placeholders and the stale `pipelines.ts`
"no inputs / group 0" comment are fixed. Shares I2's deploy note (no
`code_version` bump; redeploy when idle). _Originally found by the sweep._

**Symptom.** I2's fix derives `inputs` from a gate (`when.tag_key`) and from
rule_based_tagger `match` exprs — but **not** from the `{{tag.<key>}}` refs in
`notify.message_template`, `apply_category.category_template`, or
`llm_tagger.prompt_template` (all rendered via `renderTemplate`,
`operators/built-ins/template.ts`). A `notify` whose template reads
`{{tag.urgency}}` with no matching `when` declares `inputs: []` → runs
concurrently with the tag's producer → renders a **blank** value, and shows
un-ordered in the UI. Same silent race as I2, via the template path.

**Fix.** Extend `contractFromConfig` to scan the operator's template field(s)
for `{{tag.<key>}}` and `addInput(key)` — mirroring the rule_based_tagger path
(a template-ref extractor analogous to `extractTagRefs`). Keep read/write/execute
in lockstep. Add a contract test: `notify` with `message_template`
`'{{tag.kind}}'` and no `when` must derive `inputs: ['kind']`.

**Related cleanups found alongside:**

- **seed-demo bare placeholders** — `packages/server/src/scripts/seed-demo.ts`
  uses bare `{{urgency}}` / `{{category}}` (should be `{{tag.urgency}}` /
  `{{tag.category}}`); as written they hit the I1 unknown-placeholder→`""`
  swallow and render blank. Concrete instance of I1.
- **stale comment** — `http/api/pipelines.ts:17-19` ("MVP built-in Contracts
  declare no inputs … every Operator lands in group 0") is now false post-I2;
  it's the same "documented as intentional" framing that hid I2. Update it.
