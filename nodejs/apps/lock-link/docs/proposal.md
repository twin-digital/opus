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

**The late-booking problem, in one paragraph.** Automatic guest messages — in Lodgify and every
comparable system — are _scheduled_: "send N hours before check-in." A booking made inside that
window sends its message **immediately upon booking**. But a door code takes time to program
into the locks after a booking arrives (we've observed minutes to nearly four hours), so for
last-minute bookings the scheduled message fires **before the code exists** — the guest gets a
message with a blank where their code should be. With 1 in 7 bookings made on arrival day, this
is a weekly occurrence, not a corner case. Fixing it requires messaging that **waits until the
code is confirmed working** — which no booking system offers outright: the closest built-in
mechanisms cap the wait at minutes or silently drop the message when their window expires.

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

**Why nothing off the shelf closes the gap** — the five facts, in order:

1. **Commercial locks narrow the field to one vendor.** The DormaKaba hardware the property
   needs is unusual in short-term rentals, and the niche of smart-lock middleware that speaks
   vacation-rental booking systems is small — Lynx is the only viable provisioning vendor.
2. **OTAs strictly gate guest messaging.** Expedia, Booking.com, and Airbnb only reliably
   deliver messages sent through their own platforms or from senders tied to the host's account;
   third-party senders are blocked structurally (documented in our
   [OTA research](./due-diligence/ota-messaging-research.md)).
3. **Lynx doesn't share codes with Lodgify.** As observed across every recent booking, the
   integration behaves one-way: Lodgify never sees the codes, so its messaging — the one channel
   OTAs treat as first-class — can't carry them, and delivery falls back to Lynx's own emails,
   which fact 2 blocks. **Together, facts 2 and 3 mean nobody in the current stack can deliver
   reliably.** (Lynx's marketing page for its Lodgify integration claims codes _are_ sent to
   Lodgify; our account has never received one — reconciling that discrepancy is the top item in
   the Lynx support questions below.)
4. **The systems Lynx does share codes with have disqualifying gaps.** Each viable alternative
   booking system fails exactly where it matters most — same-day Expedia bookings that can't be
   retrieved, message review delays of up to a day, bookings arriving with no guest contact
   (documented in our [PMS evaluation](./due-diligence/pms-evaluation.md)).
5. **No system delivers "wait until the code exists, then send" as its supported model.** We
   stress-tested this claim against every candidate's documentation (see the
   [messaging-trigger research](./due-diligence/pms-messaging-triggers.md)). The closest
   capabilities stop short: OwnerRez can attach a door-code condition with hourly retries, but
   only inside a fixed window — the message is **silently dropped** when it expires, the
   feature is documented for staff alerts, and it is tied to its native lock integrations
   rather than Lynx-written fields; Hostaway holds a door-code message at most **15 minutes**,
   then sends the listing's **static** code, and gives third-party-written fields no protection
   at all (they render blank); Guesty and Cloudbeds document nothing either way; even Lynx's
   own messaging is time-offset. Late bookings therefore still end in blank, stale, or dropped
   code messages (see "The late-booking problem" above); final vendor confirmations are being
   requested. This is what keeps the gap a software gap, not a shopping gap.

That delivery-and-timing gap is what this system fills: it sends through the connected booking
system (the channel that works), waits for confirmed provisioning (the timing no one else
implements), and covers provisioning delays with standby codes.

## Alternatives considered

- **Do nothing / handle failures manually.** The current state: staff intervene per failure,
  concentrated at evenings and last-minute arrivals. Lynx support has already been engaged
  without resolution, so there is no fix coming from that direction.
- **Switch to a PMS that Lynx writes codes into.** This was evaluated in depth (see the
  [PMS evaluation](./due-diligence/pms-evaluation.md)): Lynx documents code write-back for eight systems, four
  of which are viable at this property's size (OwnerRez, Hostaway, Guesty, Cloudbeds). None
  verifiably closes the gap that motivates this project — the late and same-day bookings:
  Hostaway's own documentation says same-day Expedia reservations **cannot be retrieved
  automatically**; Cloudbeds routes Expedia guest messages through a review step with 1–24 hour
  delays and its Airbnb connection has documented limitations for vacation-home listings;
  Guesty's Expedia-affiliate bookings can arrive with no guest contact and no inbox sync; and
  OwnerRez — the best small-property fit — currently has no direct Expedia connection at all
  (Expedia is not accepting new integrations). Message timing is also unsolved: the strongest built-in
  gating is bounded (OwnerRez retries hourly but silently drops the message when its window
  expires; Hostaway holds at most 15 minutes then falls back to a static code), none of it is
  documented to work with Lynx-written fields, and Guesty/Cloudbeds document nothing — see the
  [messaging-trigger research](./due-diligence/pms-messaging-triggers.md). On top of that: migration means re-linking every channel,
  importing reservations, replacing the booking website, retraining, and $75–290/month ongoing.
  A defensible path, but it trades a build for a migration without solving the hardest 15% of
  bookings.
- **Replace Lynx with a different smart-lock platform.** Researched in depth (see the
  [lock middleware evaluation](./due-diligence/lock-middleware-evaluation.md)): the Saffire EVO
  front-door lock is managed only through dormakaba's partner platforms, and exactly **two**
  have verified support — Lynx and RemoteLock. The surprise is that cost is _not_ the obstacle
  (RemoteLock runs $24–72/month at this scale): **capability is**. RemoteLock has no Lodgify
  connection — its documented Lodgify paths are a third-party bridge or a calendar-feed
  mechanism with a known Lodgify incompatibility — and no other platform documents this lock at
  all. "Replace Lynx and keep Lodgify" has no off-the-shelf solution at any price; replacing
  Lynx therefore also means replacing the booking system, which is the alternative above.
  Notably, no platform examined offers automatic backup-code provisioning — the standby-code
  feature in this proposal — as a built-in feature.
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

## Due diligence

_This section records the vendor conversations and platform research that confirm no simpler
path exists, so the decision to build is documented alongside the decision itself. The OTA
research and PMS evaluation are complete; the Lynx support statements remain to be collected._

### Lynx support engagement

For each contact: date, channel (ticket/email/phone), what was asked, their response (quoted
where possible, with ticket numbers), and the conclusion.

Statements to obtain in writing. This list was revised after the OTA, PMS, and middleware
research completed — several original questions were answered or mooted by that research (the
OTA failures are structural on the platform side, so "is a delivery fix planned" is no longer
the right question), and the research surfaced new ones:

- [ ] **The Lodgify code write-back discrepancy (top item).** Lynx's own Lodgify integration
      page states that guest access codes are sent to Lodgify; this account has never received
      one across ~91 recent bookings. Is that feature real — and if so, is it broken here,
      gated to a plan tier, or behind configuration we're missing?
- [ ] **Exact sending address/domain for guest emails**, and whether it is stable and shared or
      per-account/customizable. (Needed to register Lynx as an approved sender in Booking.com's
      extranet — the one OTA-side mitigation available — and to evaluate whether a
      property-controlled sending identity could ever satisfy Expedia's validated-sender gate.)
- [ ] **Can Lynx's own guest notifications (email/SMS) be disabled** per property or per
      channel? (Required for cutover regardless: without it, direct-booking guests would
      receive duplicate code messages.)
- [ ] **Delivery visibility**: per-message send/bounce/delivery logs, ideally broken out by
      recipient domain — this would confirm the structural-relay diagnosis with their data.
- [ ] **Expedia's third-party sender program**: Expedia documents that support for non-Partner
      Central senders is "in the works" — is Lynx tracking it / planning to join when it ships?
- [ ] **Provisioning**: their stated time for a new reservation's code (vs. our observed 3–4 h
      same-day case), whether same-day bookings can be expedited or provisioning manually
      forced, and whether an assigned code can ever change after it reaches the locks.
- [ ] **The "Emergency Access Code" feature**: Lynx's permission model and lock data reference
      emergency access codes — what is this feature, how are those codes managed and rotated,
      and is it suitable as a guest fallback?
- [ ] **User and task-code mechanics**: how many task codes an account includes and whether
      more can be purchased; and when a secondary user is deleted, how quickly their PIN is
      removed from lock hardware and whether that can be verified. (We plan to manage
      staff/temporary users more actively.)
- [ ] Does Lynx offer a supported API, webhook, or integration program — or have one on the
      roadmap?

### OTA partner portal research (completed 2026-07-10)

The delivery failures concentrate on OTA guests, so the question researched was: **is the OTA
itself blocking or degrading Lynx's messages, and could any portal setting fix that without a
build?** Summary findings below, verified against the platforms' own documentation; the full research
record with evidence quotes and all sources is in
[ota-messaging-research.md](./due-diligence/ota-messaging-research.md).

**Expedia** (the largest channel, ~43% of recent bookings):

- Properties never receive the guest's real email — each reservation gets a masked alias.
  Expedia's own help documentation states that mail to the alias is delivered **only if sent
  from an email account associated with a validated Expedia Partner Central user account**, and
  that support for third-party senders (like Lynx) is "in the works" — i.e., does not exist.
  There is **no portal setting** that can admit a third-party sender.
  ([Expedia: About the guest email alias](https://apps.expediapartnercentral.com/lodging/help/help-article/guests/messaging-guests/about-the-guest-email-alias?langId=1033))
- All alias mail is routed through Partner Central and monitored; messages containing credit
  card numbers are blocked. No filtering of numeric door codes is documented.
- Industry-reported (not Expedia-official): real guest emails can be enabled per property only
  by request to an Expedia market manager.

**Booking.com** (~4% of recent bookings):

- Guest emails are aliases (`@guest.booking.com`); real addresses are never shared.
- **This is the one channel with a portal-level fix**: the extranet's Messaging Security
  settings let an administrator register approved sender addresses or whole domains — mail from
  unregistered senders silently never reaches guests. Registering Lynx's sending domain is the
  fix Booking.com's own documentation prescribes.
  ([Booking.com: messaging security settings](https://partner.booking.com/en-us/help/legal-security/security/all-about-our-messaging-security-settings))
- Two settings can still break delivery even for approved senders: a link-security filter that
  strips unapproved URLs, and a **"Block all email communication" toggle that suppresses
  everything** — both should be checked in the extranet regardless of this project.

**Airbnb** (~13% of recent bookings):

- **There is no email path to Airbnb guests at all.** The guest email alias was retired on
  September 30, 2023; since then neither hosts nor third-party systems can email Airbnb guests.
  ([Airbnb: alias retirement](https://platform.airbnb.com/resources/hosting-homes/a/an-update-for-hosts-who-use-the-email-alias-feature-195))
- Proxy phone numbers expire two days after checkout and do not connect calls/SMS from numbers
  not linked to the reservation — automated third-party SMS delivery is documented (by other
  smart-lock vendors) to break on exactly this.
- Real phone numbers appearing in message content are blocked or rewritten by the platform.

### Conclusion

The Lynx delivery failures are **structural, not intermittent**. On Expedia, the relay only
accepts mail from validated Partner Central accounts and no setting can change that; on Airbnb,
no email channel to guests exists at all. One channel — Booking.com, about 4% of recent
bookings — has a documented portal fix (registering Lynx as an approved sender), which we
recommend doing regardless; it does not change the picture for the other 96%. The one route all
three platforms treat as first-class is **messaging through the connected booking system
(Lodgify)** — which is precisely the route this system uses. The research also confirmed two
content rules our messages already follow: no links (Booking.com strips unapproved ones) and no
phone numbers (Airbnb rewrites them); plain numeric door codes have no documented filtering on
any channel. The "no off-the-shelf path" claim in How We Got Here stands. Remaining to complete:
the Lynx support statements above, and a check of this property's own Booking.com extranet
settings (approved-sender list and the block-all-email toggle).

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
