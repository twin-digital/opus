# Why OTA door-code delivery started failing (~mid-June 2026)

Root-cause analysis of the delivery failures that motivate this project. Status: **leading hypothesis unconfirmed; the mid-2026 timing is not explained by any public
evidence** — the Lynx bounce/NDR codes are the only decisive test outstanding (see Confirmation).
Written 2026-07-10; updated after a deliverability research pass.

## The timeline puzzle

- The DormaKaba/**Lynx** integration went live **~September 2025**. Before that, codes reached
  guests some other way (prior system / manual), so pre-Sept-2025 bookings are out of scope.
- The property manager first reported delivery problems **~mid-June 2026** — i.e. Lynx delivered
  acceptably for **~9 months**, then hit a cliff.
- So the question is not "why does it never work" but **"what changed in mid-2026?"** The booking
  data rules out the obvious answers and points at email deliverability.

## Booking data (Lodgify, created ≥ 2025-09-15)

360 Booked, non-deleted bookings since Lynx go-live. By source: **Expedia 139**, direct (OH) 108,
Manual 65, **Airbnb 30**, Booking.com 18. Full history (from Nov 2024) is 570 bookings; Expedia
is the single largest channel at ~43% of all volume, with sustained ~15–25/month through 2026.

**Guest reachability by channel** — the crux. Contact fields were checked from the raw Lodgify
`guest` object:

| Channel           | Phone                                                                         | Email                                            | Reachable via                      |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| **Expedia** (139) | **placeholder** (~43% literal `1111111111`; rest `+1 (0) …` masked; few real) | proxy `@m.expediapartnercentral.com` (forwarded) | **email only — no phone fallback** |
| **Airbnb** (30)   | real US numbers (28 distinct)                                                 | **none** (100% null)                             | **SMS only — no email fallback**   |
| Booking.com (18)  | real                                                                          | proxy `@guest.booking.com` (forwarded)           | either (+ extranet allowlist fix)  |
| Direct / OH (108) | real (+ country code)                                                         | real personal domains                            | either                             |

Two facts fall out: **Expedia — the biggest channel — is reachable only by the forwarded proxy
email**, and **Airbnb has no email at all** (SMS-only, though its numbers are real because this
API-connected property is exempt from Airbnb's non-API-host proxy-number rollout).

## Ruled out

- **"Few OTA bookings before mid-June."** No — Expedia had heavy, sustained volume since early
  2025; 233 of 244 all-time Expedia bookings were created before 2026-06-15.
- **A contact-info trend break.** No — the placeholder-phone (Expedia) and proxy-email patterns
  are flat from Sept 2025 onward, with no May/June 2026 change. Guests didn't stop having (or
  start lacking) contact info; the _deliverability_ of the one channel that reaches them changed.
- **An Expedia-specific policy change.** No documented Expedia changelog/announcement, partner
  notice, or community surge dated April–July 2026. Expedia's sender **allowlist** requirement
  (below) is long-standing (documented since ~2024, current March 2026), not a mid-2026 change.

## Two mechanisms — neither alone explains the timing

A deliverability research pass (2026-07-10, multi-source, adversarially verified) found two
real mechanisms but **could not pin the mid-June onset to any dated public event.**

**(a) Expedia's sender allowlist (documented, static).** Mail to the alias is delivered only
from addresses the property has added to the **"Authorised email addresses" list in Partner
Central → Message Centre → Settings**, which requires a **verified sending domain**; third-party/
PMS sender support is described as still "in the works" / "currently considering." Documented via
multiple PMS help centers, current as of **2026-03-10** — i.e. this gate **predates** the failure
window and did not change in mid-2026. On its own it does not explain the ~9-month working period
(a hard allowlist gate would have blocked Lynx from go-live, not mid-June) — unless Lynx's sender
was effectively getting through until something else tightened.

**(b) Industry DMARC / bulk-sender enforcement (time-varying, not Expedia-specific).** Forwarded
relay mail is exactly the pattern that breaks SPF alignment and fails DMARC without aligned DKIM
or ARC. Enforcement escalated over 2024–2026 — Gmail initial compliance Feb 2024 → some rejection
Apr 2024 → **hard rejection Nov 2025**; Outlook **junk-foldering from May 2025**, hard rejection to
follow. This is the **only time-varying factor** that fits a mid-2026 cliff, so it remains the
leading timing hypothesis. But **no public source ties this enforcement to Expedia's alias
forwarding**, and nothing dates a surge of "Expedia guest emails failing" to April–July 2026.

> [!IMPORTANT]
> **The ~9-months-then-broke-in-mid-June-2026 timing is not explained by public evidence.** The
> allowlist gate is static; DMARC enforcement is the only moving part but is unconfirmed for this
> case. The combined-and-plausible story — Lynx mail getting through a soft/default gate until
> rising DMARC enforcement crossed a threshold mid-2026 — is inference, not fact. **Only the Lynx
> bounce/NDR codes can settle it.**

## The SMS question (an additive, separate issue)

Lynx sends by **both SMS and email**. Airbnb and Booking.com and direct guests have real phones,
so SMS _should_ reach them even with email down. If Airbnb failures are also occurring, then
Lynx's SMS path is not working or not enabled — a second problem, independent of DMARC. Expedia
has no usable phone, so it depends entirely on the (now-broken) email path regardless.

## Confirmation (outstanding)

1. **Lynx bounce / NDR codes** — the deciding evidence. 550 / DMARC / SPF failures on the Expedia
   sends would confirm the mechanism directly. This is the single most valuable answer to extract
   from Lynx support (delivery-visibility question).
2. **SPF/DKIM/DMARC alignment** on whatever domain Lynx sends from (the sending-address question)
   — a second confirmation path.
3. **Which channels the manager's failures are actually on.** Expedia-heavy → confirms the
   email-only + DMARC chain. Airbnb also failing → Lynx SMS is additionally broken.
4. **Try Expedia's own allowlist** — add Lynx's sending address to Partner Central → Message
   Centre → Authorised email addresses (needs domain verification). This is the Expedia-side
   analog of Booking.com's approved-sender fix; whether it accepts a third-party sender is the
   open caveat ("in the works"). A no-cost mitigation to attempt regardless of the root cause.

## Why this strengthens, not weakens, the proposal

The failure is not "Expedia arbitrarily blocks us" but the **structural fragility of third-party
email to relay addresses** — demonstrated by an ecosystem-wide enforcement event that no property
or PMS can opt out of. The proposed fix — deliver through the **PMS/OTA-native channel**
(Lodgify's inbox → the OTA's own messaging) — is inherently **DMARC-proof**: native messages
don't ride on a third-party sender's SPF/DMARC alignment surviving a forward. That is a more
durable argument than a vendor-policy complaint.
