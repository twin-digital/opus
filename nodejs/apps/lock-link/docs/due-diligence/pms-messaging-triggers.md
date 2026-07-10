# PMS messaging triggers: time-triggered vs readiness-gated

Compiled 2026-07-10 via multi-source research with adversarial verification (votes noted;
verbatim quotes checked against live vendor pages). Purpose: stress-test the proposal's claim
that "scheduled messaging is time-triggered, not readiness-triggered" in the candidate
alternative PMSs ([pms-evaluation.md](./pms-evaluation.md)) before making it a top-line
motivation. **Result: the blanket claim is false; the defensible claim is narrower and still
decisive.**

## The defensible claim

**No platform documents open-ended "hold the guest message until the door code exists"
delivery.** What exists is bounded or partial gating, none of it verified to work with
Lynx-written custom fields — and the failure modes on expiry are silent drops or static-code
fallbacks, not held delivery.

## OwnerRez — the strongest counterexample (bounded readiness-gating exists)

- **Scheduled triggers support "Retry"** (3-0, four claims): hourly re-evaluation of the
  trigger's Conditions within a configurable window (until cutoff / N days / until arrival or
  departure); sends exactly once when conditions match. Without Retry, an unmet trigger is
  skipped entirely; **when the retry window expires unmet, the message is permanently dropped —
  never held indefinitely**. Before-arrival retries run until the day after arrival explicitly
  for last-minute bookings.
  ([Triggers setup](https://www.ownerrez.com/support/articles/triggers-setup-configuration),
  [common issues](https://www.ownerrez.com/support/articles/triggers-common-issues-questions))
- **A "Door Code Status" condition exists** (3-0, three claims): `Code Not Generated / Code
Failed to Generate / Code Generated Successfully`. Combined with Retry this is a genuine,
  vendor-documented readiness gate on code existence. Caveats: the announced use case is
  **staff notification about door-code problems**, not gating guest delivery; and the status
  almost certainly reflects OwnerRez's **native** door-lock integrations — whether it sees a
  Lynx-written custom field (`{BXLYNXACCESSCODE}`) is **unverified** (vendor question below).
- **The documented delivery model is still time-offset** (3-0/2-1/2-1): the recommended guest
  arrival template fires "5 days before booking arrives at 9:00 AM"; the Lynx integration only
  populates the custom merge field; "custom field is empty" trigger criteria are **feature
  requests, not shipped**.

## Hostaway — a 15-minute bounded gate, custom fields unprotected

- **Standard `door_code` field**: door-code messages are delayed **up to 15 minutes** when the
  field is empty — explicitly to let lock integrations push a code via the public API — then
  the system **falls back to the listing's static door code** (3-0/2-1/3-0). No hold exists
  beyond 15 minutes; Hostaway recommends timing margin or a permanent code.
  ([Adding a door code](https://support.hostaway.com/hc/en-us/articles/360052123153))
- **Custom fields (where Lynx writes)**: **no protection at all** — an empty custom field
  renders as a blank/space in the sent message; not skipped, held, or errored (2-1, two docs).
- **Native Smart Locks integration populates a field**; it does not send messages on code
  creation (3-0).
- ⚠️ **Unverified risk**: a changelog entry documents automation **conditions on custom fields**
  (`is empty` / `is not empty`) with re-check on field change ("automations will cancel/resume
  accordingly"). Whether "resume" means a blocked scheduled message sends late once the field
  populates is **not established** — changelog-grade source, no support doc. This is the
  single biggest threat to the framing for Hostaway; vendor question below.

## Guesty and Cloudbeds — evidence gap

**No claims survived verification for either platform** (including Guesty's smart-lock add-on /
key-code field and Cloudbeds' `LYNX_ACCESS_CODE` / Whistle). The claim is neither supported nor
refuted for them — treat as unknown pending the vendor confirmations.

## Lynx's own messaging — also time-offset

Lynx's native email/SMS/portal delivery is configured as time offsets ("3–7 days before
check-in"); its integration docs describe no message trigger tied to code creation and no
conditional/delayed sending (3-0, two claims). Even the incumbent middleware doesn't
readiness-gate its own delivery — the capability this build implements exists nowhere in the
current or candidate stack.

## Consequences for the proposal

The top-line fact is restated as: **no system delivers "wait until the code exists, then send"
as its supported model** — the closest capabilities are bounded (OwnerRez's retry window with a
silent permanent drop on expiry; Hostaway's 15-minute hold with static-code fallback), tied to
native lock integrations rather than Lynx-written fields, or entirely undocumented (Guesty,
Cloudbeds). Final confirmations are being requested from each vendor
([vendor-confirmation-request.md](./vendor-confirmation-request.md)).
