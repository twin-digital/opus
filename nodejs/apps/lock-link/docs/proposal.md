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

| Item                                            | Approved by | Date |
| ----------------------------------------------- | ----------- | ---- |
| Scope and features as described                 |             |      |
| Standby-code security policy (default: 1 guest) |             |      |
| Lynx setup prerequisites                        |             |      |
| Observation-mode rollout plan                   |             |      |
