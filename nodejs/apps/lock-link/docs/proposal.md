# Automatic Door-Code Delivery — Proposal

Prepared by Twin Digital for review and sign-off before the build begins.

## The problem

Guests need their door code before they reach the property. Today that delivery depends on
Lynx's own guest emails, which have proven unreliable — especially for guests who book through
Expedia or Booking.com, whose relay email addresses frequently swallow the message. When
delivery fails, the guest calls (or stands outside), and staff drop what they're doing to sort
it out.

The data says this isn't rare. Looking at the last 60 days of bookings:

- **About 1 in 7 bookings (15%) is made on the day of arrival** — the exact bookings where
  timing is tightest and delivery failures hurt most.
- We observed a guest who booked through Expedia **four minutes after check-in time** and whose
  door code wasn't ready anywhere until **almost four hours later**. Under the current setup,
  that guest waits — or calls.

## How we got here

A short recap, because the constraint driving everything is the hardware:

- The original smart-lock platform (Jervis, driving Tuya locks) had persistent code-provisioning
  failures it was unable to resolve. The locksmith's search for a replacement found exactly one
  lock system that met all of the property's needs with remote control: **DormaKaba** — a
  commercial line that is unusual in short-term rentals, which is why most hospitality software
  doesn't support it.
- **Lynx was the only platform found** that supports these locks _and_ automatically provisions
  guest codes from reservations. It does that job; what it doesn't do reliably is **deliver**
  the codes (the OTA-guest email failures above), and it doesn't share codes with Lodgify — so
  Lodgify's own messaging features can't send them either.
- Even if the codes reached Lodgify, its scheduled messages fire **immediately** for bookings
  made less than 24 hours before check-in — before any code exists — which would send guests
  blank-code messages for exactly the bookings where timing is tightest. (Jervis papered over
  this with a separate bare-bones SMS containing just the code.)

In short: the lock hardware is right for the property, Lynx is the only way to drive it, and
nothing off the shelf closes the delivery gap. That gap is what this system fills.

## Alternatives considered

- **Do nothing / handle failures manually.** The current state: staff intervene per failure,
  concentrated at evenings and last-minute arrivals. Lynx support has already been engaged
  without resolution, so there is no fix coming from that direction.
- **Switch to a PMS with better lock support.** Researching each candidate seriously costs a
  few hundred dollars; an actual migration means significant cost, staff retraining, and
  workflow change — and PMS-native support for commercial DormaKaba hardware is likely to be
  rare for the same reason most platforms don't support it today.
- **Adopt a different smart-lock integration platform.** The platforms known to support this
  class of hardware run **$1,000+ per month** (concrete examples available on request) — more
  than an order of magnitude above the ongoing cost of this system.
- **Replace the locks.** Consumer short-term-rental hardware would unlock inexpensive
  off-the-shelf tooling, but the DormaKaba units were selected because nothing else met the
  property's requirements — replacing working commercial locks on every door to fix a message
  delivery problem is backwards.
- **Physical fallbacks (lockboxes, key handoff).** A regression in both guest experience and
  security, and still per-stay work for staff.

## What we're building

A system that takes over guest door-code delivery end to end:

1. **Watches every booking automatically**, around the clock, checking for new and changed
   bookings every 10 minutes.
2. **Waits until the code actually works.** A code is only sent after the lock system confirms
   it has been programmed into **every** door the guest needs. The system never sends a code
   that opens some doors but not others, and it handles the case where different doors have
   different codes.
3. **Sends at the right time.** Codes go out 24 hours before arrival — close enough to be
   found easily, not so early that they're lost in an inbox. Last-minute bookings are handled
   the moment their code is ready, with no waiting for a scheduled send.
4. **Delivers where guests already look.** Messages go through Lodgify's messaging, so they
   reach the guest by email — or through the booking channel for Expedia/Booking.com guests —
   and every message stays in the same Lodgify inbox conversation you already use. Nothing
   about how you communicate with guests changes.
5. **Never leaves a guest stranded.** Each unit keeps **standby emergency codes** pre-loaded in
   its locks. If the lock system is slow to prepare a guest's code and arrival is close, the
   system automatically sends a standby code instead — within about 15–20 minutes of the
   booking, even for someone who books standing at the door.
6. **Tells staff only what needs human attention.** Alerts go out when — and only when — there
   is something a person should do: a guest who can't be reached, an arrival approaching with
   no code available, or a standby code that needs a security check. Routine successes are
   logged, not broadcast. Technical faults go to Twin Digital, not to staff.

## What this means for guests

- Codes arrive predictably, in the conversation thread they already have with the property.
- A guest who books weeks ahead gets their code the day before arrival. A guest who books from
  the parking lot gets one in roughly a quarter of an hour.
- No guest is told "your code is on the way" by an automated email that fires whether or not
  the code exists.

## What this means for staff

- **No more manual code delivery** — no copying codes out of the Lynx dashboard, no chasing
  whether a code was actually sent, no late-evening calls from locked-out arrivals that trace
  back to a delivery failure.
- **Standby codes manage themselves.** The system creates them ahead of time, keeps a spare
  per unit, and retires and replaces them after use according to a security policy you approve
  (see below). Staff are only involved if something needs a decision.
- **One alert channel, only for real actions.** When the system asks for attention, the message
  says which booking, which unit, and what to do.

## Reliability measures

- Every send is confirmed against the inbox afterward — the system verifies the message exists
  and tracks its delivery status, rather than assuming success.
- Every booking is re-checked continuously until its code is delivered; a temporary failure
  anywhere (Lynx, Lodgify, email) is retried automatically on the next cycle.
- The lock system remains the source of codes; this system never invents or overrides guest
  codes — it delivers what Lynx provisions, and falls back to standby codes only when
  provisioning is late.
- Everything the system does is recorded, so any question — "did guest X get their code, and
  when?" — has an exact answer.

## Security policy for standby codes (needs your decision)

A standby code, once given to a guest, stays working until it is retired — which means a past
guest could, in principle, use it again until then. Retiring codes too aggressively carries its
own risk: heavy code churn stresses the lock hardware and the Lynx system. The system therefore
makes this a policy setting:

- **Default: each standby code is retired after serving one guest.** Strongest security, most
  churn.
- The policy can be relaxed (a code serves up to N guests, or codes are reused indefinitely) if
  churn causes problems. Uses older than ~3 months stop counting, on the reasoning that a guest
  from last season no longer has the code at hand.

We recommend starting with the default and revisiting once real usage data exists.

## Scope options

The core of the system is not divisible — watching bookings, waiting for verified codes,
sending on time, confirming delivery, and alerting on real problems is the product. Around that
core, three pieces can be scaled to fit budget:

1. **Standby codes** (the largest cost lever), three levels:
   - **None** — at-risk arrivals alert staff for manual handling. Cheapest; guest experience
     then depends on staff availability at exactly the hours coverage is thinnest.
   - **Semi-automatic** — staff create the standby codes once; the system issues them
     automatically when needed and alerts staff to retire and replace used ones.
   - **Fully automatic** (proposed) — the system creates, monitors, issues, retires, and
     replaces standby codes itself, under the security policy above. Staff touch nothing unless
     alerted.
2. **Two-channel alerting** — separate business and technical alert channels (proposed). Can be
   collapsed to one channel at a small saving, at the cost of staff seeing technical noise.
3. **Performance reporting** — the measurement layer that tunes send timing and thresholds
   against real provisioning behavior. Can be deferred; the system then runs on its initial
   settings.

## Due diligence (to be completed before sign-off)

_Placeholder — this section records the vendor conversations and platform research that confirm
no simpler path exists, so the decision to build is documented alongside the decision itself._

### Lynx support engagement

For each contact: date, channel (ticket/email/phone), what was asked, their response (quoted
where possible, with ticket numbers), and the conclusion.

Statements to obtain in writing:

- [ ] The OTA-guest delivery failures we reported: is a fix planned, and on what timeline?
- [ ] Does Lynx offer delivery visibility — per-message logs, bounce reports, or delivery
      confirmations — that staff could monitor?
- [ ] Can Lynx write the codes it provisions into Lodgify (or any PMS field), so the PMS could
      handle messaging?
- [ ] Does Lynx offer a supported API, webhook, or integration program — or have one on the
      roadmap?
- [ ] What is Lynx's stated provisioning time for a new reservation's code (their documented
      figure vs. our observations)?
- [ ] How many task codes does an account include, and can that number be increased?

### OTA partner portal research

The delivery failures concentrate on OTA guests, so for each channel (Expedia Partner Central,
Booking.com extranet, Airbnb) the question is: **is the OTA itself blocking or degrading Lynx's
messages, and could any portal setting fix that without a build?** Record per channel:

- [ ] What guest contact information the property actually receives — relay email addresses,
      masked phone numbers — and whether any portal setting shares real contact details.
- [ ] Relay behavior: which senders can deliver through the guest's relay address? Is delivery
      restricted to the booking platform / connected PMS, and is there any approved-sender or
      allowlist mechanism that could admit Lynx's emails?
- [ ] Any evidence in the portal of Lynx's messages being filtered, blocked, or spam-foldered —
      message logs, delivery indicators, bounce records.
- [ ] Whether the masked phone relay accepts SMS from external senders (relevant to any
      SMS-based workaround).
- [ ] Any documented content filtering in relayed messages (codes, links, phone numbers) — this
      applies to our own delivery path too; record findings either way.

Expected conclusion: the relays only reliably carry traffic from the booking platform and its
connected PMS — which is exactly why this system delivers through Lodgify — and no portal
setting can admit a third-party sender like Lynx. Confirming (or refuting) that is the point.

### Conclusion

_One paragraph, written after the above: what remains true (or changed) about the "no
off-the-shelf path" claim in How We Got Here._

## What we need from you

1. **Lynx setup**: one lock group per unit configured in the Lynx dashboard (we'll provide
   exact instructions), and agreement that the 8 Lynx "task codes" are reserved for this
   system's standby users.
2. **Sign-off on the standby-code security policy** above.
3. **A test booking** (staff-created) for end-to-end verification before any real guest is
   touched.
4. **A go-live review**: the system first runs in observation mode — logging exactly what it
   _would_ send, without sending — for about a week. We review that log together, then switch
   deliveries on.

## Honest limits

- The system's speed is bounded by Lynx's own provisioning: it cannot make a lock accept a code
  faster; it can only detect readiness immediately and never miss the moment. The standby
  mechanism exists precisely for the cases where Lynx is slow.
- The Lynx integration uses the same interface as the Lynx dashboard, which Lynx does not
  officially support for outside systems. If Lynx changes their system, parts of this may need
  maintenance. Monitoring is built in so such changes surface to Twin Digital quickly — this is
  a maintenance fact of life, not a reason the design would stop working.
- Even in the worst case — the Lynx connection permanently lost — the delivery system keeps
  working: staff enter each booking's code by hand (reading it from the Lynx dashboard as they
  would today), and the system still handles the timing, the verified sending, the delivery
  tracking, and the alerts. Guests already booked keep receiving codes automatically, and the
  standby codes continue to cover late arrivals in the meantime.

## Sign-off

| Item                                                        | Approved by | Date |
| ----------------------------------------------------------- | ----------- | ---- |
| Scope and features as described                             |             |      |
| Scope options selected (standby level, alerting, reporting) |             |      |
| Standby-code security policy (default: 1 guest)             |             |      |
| Lynx setup prerequisites                                    |             |      |
| Observation-mode rollout plan                               |             |      |
