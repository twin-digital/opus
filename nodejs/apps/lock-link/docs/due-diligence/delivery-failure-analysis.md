# Why OTA door-code delivery started failing (~mid-June 2026)

Root-cause analysis of the delivery failures that motivate this project. Status: **leading
explanation identified, confirmation pending** (a deliverability research pass and the Lynx
bounce/NDR codes are outstanding — see Confirmation below). Written 2026-07-10.

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
- **An Expedia-specific policy change.** No documented Expedia changelog/announcement in 2026
  touches guest-email or sender authentication; the validated-sender rule is long-standing
  (documented since ~2024), not new. (See [ota-messaging-research.md](./ota-messaging-research.md).)

## Leading explanation: the 2026 DMARC / email-authentication enforcement cliff

Lynx emails codes to the OTA **relay alias**, which **forwards** to the guest's real inbox.
Forwarding breaks SPF and — without ARC — DMARC alignment. Enforcement of the Gmail/Yahoo/
Microsoft bulk-sender + DMARC rules escalated from spam-foldering to **hard SMTP 550 rejection**
on a public timeline that lines up with the symptom:

- Gmail → SMTP-level rejection: **Nov 2025**
- Microsoft auth enforcement completed: **~Apr 30 2026**
- DMARC enforcement "fully active across all three major providers": **~May 2026**

So a third-party sender's forwarded mail to the alias **worked while enforcement was lax (Sept
2025 → spring 2026), then began being rejected mid-2026** — with **no change on the property's or
Expedia's side.** A mid-June report trailing a May enforcement milestone by a few weeks is the
expected lag. This also explains the channel pattern: **Expedia fails hardest** because it is
email-only (no phone fallback), while Airbnb (real phone), Booking.com (real phone + allowlist),
and direct (real everything) have alternate paths.

> [!NOTE]
> This is an **inference from industry sources**, not yet a confirmed bounce analysis. It is the
> best fit for the evidence but must be verified before being stated as fact.

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
4. A deep-research deliverability pass (partner-forum reports + Expedia materials on
   `@m.expediapartnercentral.com` deliverability, DMARC, filtering) is in progress.

## Why this strengthens, not weakens, the proposal

The failure is not "Expedia arbitrarily blocks us" but the **structural fragility of third-party
email to relay addresses** — demonstrated by an ecosystem-wide enforcement event that no property
or PMS can opt out of. The proposed fix — deliver through the **PMS/OTA-native channel**
(Lodgify's inbox → the OTA's own messaging) — is inherently **DMARC-proof**: native messages
don't ride on a third-party sender's SPF/DMARC alignment surviving a forward. That is a more
durable argument than a vendor-policy complaint.
