# PMS Evaluation: Lynx Code Pushback + 4-Unit Fit

Compiled 2026-07-10 (Twin Digital, out-of-band research). Pricing figures are a mix of published
rates and operator-reported quotes; verify directly with vendors before committing. Supports the
"switch PMS" alternative in [proposal.md](../proposal.md).

**Verification status (2026-07-10):** the two decision-critical vendor claims were spot-checked
against the official support pages via search-indexed content (the help centers block direct
fetching): the Hostaway Expedia same-day retrieval limitation and the Cloudbeds Airbnb
`vacation_home` availability limitation both match the vendor docs verbatim. The Cloudbeds micro-property
decline was observed first-hand (demo auto-reply, 2026-07-10). The Escapia 25+ unit
minimum and the OwnerRez Expedia status rest on secondary sources (STRhub; OwnerRez forums) and
carry their original confirm-with-vendor caveats.

## 1. PMS systems with Lynx integration + access-code pushback

Lynx's support center ("PMS Setup" section:
<https://support.getlynx.co/hc/en-us/sections/360008344012-PMS-Setup>) documents code pushback —
where Lynx writes the guest access code back into the PMS so native PMS messaging can deliver
it — for the following systems:

| PMS        | Pushback mechanism                                                                                                                      | Documentation                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Cloudbeds  | Auto-created `LYNX_ACCESS_CODE` custom field, usable in Cloudbeds correspondence                                                        | Dedicated article              |
| Guesty     | Syncs to Guesty's key code field; `{{key_code}}` merge tag in auto-messages                                                             | Dedicated article              |
| Track      | `{{reservation.doorCode}}` merge field or guest portal                                                                                  | Dedicated article              |
| OwnerRez   | `{BXLYNXACCESSCODE}` custom field for email templates and triggers                                                                      | Dedicated article (both sides) |
| Hostaway   | `{BXLYNXACCESSCODE}` custom field; explicit "send access code back to PMS?" toggle                                                      | Dedicated article (both sides) |
| Escapia    | Access codes in Escapia guest communications                                                                                            | Dedicated article              |
| MyVR       | Custom fields embeddable in reservation/messaging templates                                                                             | Dedicated article              |
| Streamline | "How To **Find** Lynx Access Codes" — softer wording; may be view-only rather than a messaging merge field. Verify template capability. | Dedicated article (caveat)     |

**Setup docs exist but no access-code pushback article:** Lodgify, Think Reservations, WebRezPro,
StayNTouch, RDP, Direct, LMPM, ReservIT, Booking Automation, CiiRUS, RNS.

**Pushback impossible (one-way iCal):** Hospitable, Vrbo-direct.

## 2. Narrowing filter: 4-unit property

| PMS        | Verdict                    | Reason                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MyVR       | ❌ Eliminated              | Acquired by Guesty (2021); effectively sunset per user reviews ("quit supporting the software"). Not viable for new signups.                                                                                                                                                                                                                                                                                            |
| Track      | ❌ Eliminated              | Enterprise VRM aimed at large professional managers; quote-only, sales-led. Not built for 4 units.                                                                                                                                                                                                                                                                                                                      |
| Streamline | ❌ Eliminated              | Same enterprise profile as Track, plus the pushback-capability caveat above.                                                                                                                                                                                                                                                                                                                                            |
| Escapia    | ❌ Likely eliminated       | Expedia Group-owned professional VRM. Per STRhub, requires **25+ units under management**; individual self-managing owners not served. Confirm with sales if desired, but likely a policy disqualification at 4 units.                                                                                                                                                                                                  |
| OwnerRez   | ✅ Candidate               | Published sliding-scale pricing, no contracts/setup fees, self-serve. Strongest small-portfolio fit.                                                                                                                                                                                                                                                                                                                    |
| Hostaway   | ✅ Candidate               | Quote-only but actively serves 1–4 unit operators.                                                                                                                                                                                                                                                                                                                                                                      |
| Guesty     | ✅ Candidate               | Lite caps at 3 listings, so 4 units forces the quote-only Pro tier (min. 2 listings).                                                                                                                                                                                                                                                                                                                                   |
| Cloudbeds  | ⚠️ Effectively unavailable | Targets ~20–100-room hotels; quote pricing (~$120–600+/mo) is uneconomic for micro-properties. A demo request identifying us as a 4-room hotel drew an **auto-decline** (2026-07-10): "not quite ready to showcase those features… we'll be in touch" — a polite segment gate, same shape as Escapia's 25-unit minimum. Has the most automated Lynx integration of the group, but that's moot if they won't onboard us. |

## 3. OTA support (candidates)

| PMS       | Airbnb                 | Vrbo                                                   | Booking.com            | Expedia                   | Google VR              |
| --------- | ---------------------- | ------------------------------------------------------ | ---------------------- | ------------------------- | ---------------------- |
| OwnerRez  | ✅ Direct API          | ✅ Direct API                                          | ✅ Direct API          | ⚠️ Indirect via Vrbo¹     | ✅ Direct API          |
| Hostaway  | ✅ Preferred Partner   | ✅ Elite Partner                                       | ✅ Preferred Partner   | ✅ 2-way API ⚠️²          | ✅³                    |
| Guesty    | ✅ Direct API          | ✅ Direct API                                          | ✅ Direct API          | ✅ Direct                 | ✅³                    |
| Cloudbeds | ✅                     | ✅³                                                    | ✅ Core channel        | ✅ Core channel           | ✅ (Hotel/VR)          |
| Escapia   | ⚠️ Via EscapiaConnect⁴ | ✅ Direct (Expedia Group-owned; privileged connection) | ⚠️ Via EscapiaConnect⁴ | ✅ Direct (Expedia Group) | ⚠️ Via EscapiaConnect⁴ |

¹ **OwnerRez/Expedia (updated):** No direct API — Expedia is not accepting new API connections
while it consolidates its brands (including Vrbo) onto one unified API; OwnerRez expects a direct
connection if/when that completes, with no timeline. However, Vrbo channel-integrated properties
with Instant Book enabled are automatically eligible for distribution to Expedia and Hotels.com
via Vrbo's Expanded Distribution Network (appearance not guaranteed; properties charging a
damage-protection surcharge are excluded). Bookings arriving this way flow through the Vrbo API
and behave exactly like Vrbo bookings — so Lynx code generation and messaging triggers fire
normally, with no same-day retrieval gap. Tradeoff: no Expedia-specific rate/content control from
OwnerRez. Sources: <https://www.ownerrez.com/forums/requests/expedia-intergration> and
<https://www.ownerrez.com/support/articles/auto-populated-expedia-url-capture>

² **Hostaway/Expedia same-day booking limitation (verified against the vendor doc):** Hostaway
is an official Expedia partner with full 2-way API sync (rates, availability, payments, and
Expedia's messaging API). However, Hostaway's own FAQ states that the main limitation of the
connection is **same-day bookings** — due to the short retrieval window, these reservations
cannot be pulled into Hostaway automatically. Hostaway recommends either creating the reservation
manually as a direct booking or disabling same-day booking on the Expedia listing. This directly
undermines automated Lynx door-code delivery for same-day Expedia reservations — the exact
bookings where timing is tightest. Source:
<https://support.hostaway.com/hc/en-us/articles/360015503053-Expedia-FAQs>

³ Standard offering per general channel lineups, but not verified against a primary source during
this research — confirm in vendor outreach.

⁴ Escapia has no direct API to Airbnb, Booking.com, or Google. These connect via EscapiaConnect —
Escapia's built-in add-on channel manager (flat monthly fee per enrolled property; channel
commissions may be additional) — or via third-party channel managers (e.g., Rentals United). Its
Vrbo/Expedia connections are direct and privileged as an Expedia Group product. Sources:
<https://www.escapia.com/features/distribution-channels/> and
<https://strhub.com/product/escapia-for-hosts/>

## 3b. Channel integration caveats (from vendor support docs)

Scanned each candidate's channel documentation for limitations affecting reservation retrieval
timing and guest-contact delivery (the two failure modes for door-code automation).

**Cross-cutting (all PMSs):**

- Airbnb never provides guest emails; delivery = Airbnb platform messaging or SMS. Airbnb's
  Off-Platform Policy prohibits links, phone numbers, and emails in messages — code-delivery
  templates must be plain text (numeric codes are fine; guest-portal links are not) or messages
  may be blocked.
- Vrbo does not allow same-day reservations at all (per Guesty docs) — removes Vrbo from the
  same-day risk surface.
- Booking.com uses alias/passthrough guest emails and mangles hyperlinks; send codes as plain
  text, links as raw URLs.

**OwnerRez** — cleanest scan:

- Same-day bookings explicitly supported with per-channel cutoff config: Airbnb, Booking.com,
  Google VR, Vrbo (before 12 PM property-local). Source:
  <https://www.ownerrez.com/support/articles/property-availability-rules>
- Booking.com Request-to-Book mode: calendar not blocked during up-to-48h acceptance window
  (double-booking risk) — use instant book. Source:
  <https://www.ownerrez.com/support/articles/channel-management-api-integrations-bookingcom-common-issues-questions>

**Hostaway:**

- Expedia same-day bookings not retrievable (see §3 footnote ²). Derived/child Expedia rate plans
  can't sync and can prevent reservation retrieval. Listings can't be exported to Expedia
  (managed in Partner Central). Source: <https://support.hostaway.com/hc/en-us/articles/360015503053>
  (updated June 17, 2026)

**Guesty:**

- Expedia redirects vacation-rental property types to Vrbo (Expedia prioritizes hotel-style
  inventory) — a VR "Expedia" presence may effectively be Vrbo.
- Expedia Affiliate Network bookings (Hotels.com, Orbitz, etc.) can arrive without guest email;
  messages don't sync to Guesty inbox — manual lookup in Partner Central required. Silent
  code-delivery failure mode.
- Host-initiated Expedia changes/cancellations require contacting Guesty support to sync
  (auto-sync in beta). Publishing listings Guesty→Expedia not supported.
- Sources: <https://help.guesty.com/hc/en-gb/articles/9358073761693> and
  <https://help.guesty.com/hc/en-gb/articles/9370038876829>

**Cloudbeds** — most severe findings:

- **Airbnb API cannot update availability for listing types including `vacation_home` and
  `house`** (verified against the vendor doc) — "Cloudbeds PMS can receive bookings, but
  functionality is limited." Potentially disqualifying for a vacation rental. Source:
  <https://myfrontdesk.cloudbeds.com/hc/en-us/articles/360007475294>
- Vrbo API supports hotel-collect payment only (you process payments; channel collect
  unsupported). Vrbo cancellations/modifications take up to 24h to sync.
- Booking.com may withhold guest phone numbers on reservations made >14 days before arrival
  (affects SMS delivery).
- Expedia messages pass through Expedia's review mechanism: 1–24 hour delivery delays —
  incompatible with same-day code delivery via Expedia messaging. Source:
  <https://myfrontdesk.cloudbeds.com/hc/en-us/articles/8814187915547>

**Escapia:**

- **25+ unit minimum**; individual self-managing owners not served (per STRhub) — likely policy
  disqualification at 4 units. Confirm with sales.
- No 2-way SMS within Escapia (third-party integration required) and no unified inbox across
  OTAs — weakens native-messaging code delivery, though EscapiaConnect now routes Airbnb
  communications into Escapia's Communications Hub.
- Airbnb/Booking.com/Google reachable only via EscapiaConnect add-on or third-party channel
  manager (see §3 footnote ⁴).
- Standout strength: direct, privileged Vrbo/Expedia connection with exclusive Expedia Group
  market data; reported outperformance on Vrbo vs. other software.

## 4. Pricing (candidates, ~4 units)

| PMS          | Upfront / onboarding                                                              | Monthly (4 units)                                                        | Notable extra fees                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OwnerRez     | $0 (no setup fees or contracts); optional ProConnect setup help from $500         | ~$75–88 (published sliding scale; $40 for 1 property, $88 reported at 5) | Premium feature add-ons priced per property; SMS overage 1.5¢/segment after 500                                                                                                                            |
| Hostaway     | $300–$1,000 one-time onboarding (negotiable; sometimes waived with annual prepay) | ~$125–175 (operator-reported quotes for 1–4 listings; quote-only)        | 1% application fee on Stripe payments; 1.8% booking-engine fee on direct bookings; user-reported $8/property for automated keyless entry codes; annual contract default                                    |
| Guesty (Pro) | $300–$1,500 onboarding (one Reddit report: $2,000 initiation)                     | ~$160–290 (reported $40–72/listing/mo at 4–9 units; quote-only)          | Reported $0.75 per smart-lock code generated; ~2.9% + $0.30 GuestyPay on direct bookings; add-on modules; 5–8% typical annual renewal increase                                                             |
| Cloudbeds    | Quote-based                                                                       | Quote-based (custom pricing)                                             | Unknown — itemize in outreach                                                                                                                                                                              |
| Escapia      | Quote-based; **25+ unit minimum reported**                                        | Tiered flat monthly by property count; contact for pricing               | No per-booking % fees; no distribution fees on 30+ direct channels; EscapiaConnect (Airbnb/Booking.com/Google) is a separate flat monthly fee per enrolled property, channel commissions may be additional |

## 5. Outreach channels

| Vendor    | How to reach                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OwnerRez  | Self-serve: 14-day free trial, weekly demo webinars, complimentary onboarding calls, support tickets — no sales call required. <https://www.ownerrez.com/pricing> |
| Hostaway  | Demo request (quote provided only after demo). <https://www.hostaway.com/pricing/>                                                                                |
| Guesty    | Sales contact / demo form. <https://www.guesty.com/pricing/>                                                                                                      |
| Cloudbeds | Demo request. <https://www.cloudbeds.com>                                                                                                                         |
| Escapia   | Demo form. <https://www.escapia.com>                                                                                                                              |

### Questions to itemize in every outreach

1. Total pricing for 4 units: monthly rate, onboarding fee, and **every** per-booking,
   per-payment, and per-lock-code fee, in writing.
2. Door-code messaging: minimum trigger delay after booking confirmation; behavior for same-day
   and post-check-in bookings; what a template renders if the Lynx code field is still empty.
3. Migration from Lodgify: channel relink process (Airbnb/Vrbo/Booking.com), upcoming-reservation
   import, direct-booking site replacement, expected operator hours.
4. OTA scope: confirm Expedia and Google VR support and any channel-specific limitations
   (especially same-day booking retrieval).
