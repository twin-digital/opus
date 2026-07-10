# OTA guest-messaging research: contact info, sender restrictions, content filtering

Compiled 2026-07-10 via multi-source research. Supports the OTA due-diligence section of [proposal.md](../proposal.md). Separates **vendor-documented** facts from **industry-reported** behavior.

## Expedia (Expedia Partner Central)

**Contact info** — vendor-documented:

- Properties never receive the guest's real email for messaging. Each reservation is assigned a
  unique masked **guest email alias** (`@m.expediapartnercentral.com`; API-delivered
  reservations may show `@reply.expedia.com`).
  ([About the guest email alias](https://apps.expediapartnercentral.com/lodging/help/help-article/guests/messaging-guests/about-the-guest-email-alias?langId=1033))
- Industry-reported (AirHost, ThinkReservations — not Expedia-official): real guest email can be
  enabled per property only by request to an **Expedia market manager**; no self-service portal
  setting exposes it.

**Sender restrictions** — vendor-documented, verified verbatim:

> "For security reasons, the email account sending the email must be associated with a validated
> Expedia Group Partner Central user account. We are working to support non-Partner Central user
> email accounts, enabling you to use the guest email alias with your Customer Relationship
> Management (CRM) or another third-party system."

- I.e. the relay is **sender-gated to validated EPC user accounts**; arbitrary external senders
  (Lynx) are dropped, third-party support is "in the works", and **no partner-facing allowlist
  exists**. This is the most direct documented explanation for the observed Lynx delivery
  failures on Expedia. Corroborated by ThinkReservations ("not allowed to be used by PMS
  systems"), Hostaway, AirHost, and a Mews community thread documenting rejected PMS-sent mail.

**Content filtering** — vendor-documented:

- All alias mail is "routed through Partner Central and monitored for appropriate use."
- Emails containing a **credit card number are blocked** (PCI; virtual card numbers exempt).
- No public documentation reports filtering of numeric door codes.

## Booking.com (extranet / Connectivity)

**Contact info** — vendor-documented:

- Real emails are never shared in either direction: guests and partners only ever see aliases
  (`@guest.booking.com` / `@partner.booking.com`), **including in Connectivity API reservation
  data** delivered to connected systems.
  ([Contacting guests](https://partner.booking.com/en-us/help/reservations/contact-extranet/contacting-guests))

**Sender restrictions** — vendor-documented; **the one partner-configurable fix among the three
channels**:

- The email relay is **sender-allowlisted, and the allowlist is partner-managed**: Extranet →
  Property → Messaging preferences → Security settings (admin rights + 2FA; can be applied
  across a group account) registers approved sender addresses or entire domains
  (`@example.com` admits any address at the domain). "Any emails sent from unregistered email
  addresses won't reach your guests."
  ([Messaging security settings](https://partner.booking.com/en-us/help/legal-security/security/all-about-our-messaging-security-settings))
- Registering Lynx's sending address/domain here is the fix Booking.com's own docs and multiple
  vendors (Tab, ChargeAutomation, Duve, RoomRaccoon, Smoobu, Oaky, innRoad) prescribe for
  exactly this failure mode — no custom software required **for this channel**.

**Content filtering** — vendor-documented; two settings can break delivery even for allowlisted
senders:

- **Link filtering**: with link security on, any URL not on the property's approved-links list
  is stripped — the guest sees `[Link was removed]`. There is also a "Block all links" toggle,
  and Booking.com unilaterally disables link-sending on suspicious account activity.
- **"Block all email communication" toggle**: suppresses ALL email to guests, **including from
  approved senders** — if enabled, every emailed door code silently fails. Worth checking in
  the extranet as a possible contributor to the observed failures.
- **Attachments**: PDF and QR-code attachments are blocked (images only).

## Airbnb

**Contact info** — vendor-documented:

- **No email path to guests exists at all.** Airbnb never shared real guest emails; the
  anonymized alias (`<name>-<random>@guest.airbnb.com`) was removed for most hosts in August
  2020 and **retired entirely on September 30, 2023**. Since then neither hosts nor third-party
  systems can email Airbnb guests — delivery is Airbnb messaging (host account or connected
  API software) or a real email the guest volunteers off-platform.
  ([Airbnb alias retirement](https://platform.airbnb.com/resources/hosting-homes/a/an-update-for-hosts-who-use-the-email-alias-feature-195))
- Phone contact is via **temporary proxy numbers** (US/Canada, limited rollout), active from
  booking until **two days after checkout**, then expired.
  ([Airbnb Help 3764](https://www.airbnb.com/help/article/3764))

**Sender restrictions** — vendor-documented:

- Calls/SMS from a phone **not linked to the reservation are not connected automatically** —
  the sender must verify with the reservation phone number or confirmation code. An automated
  third-party system texting the proxy number cannot reliably deliver; Hospitable has publicly
  documented smart-lock code delivery breaking on exactly this.
  ([Hospitable changelog](https://community.hospitable.com/hospitable-changelog-3/how-airbnb-s-temporary-phone-numbers-affect-smart-lock-codes-621))

**Content filtering** — vendor-documented, verified verbatim:

> "Any exchange of real phone numbers through the Airbnb platform (in Airbnb messenger, emails,
> text fields in listing setup, etc.) will be blocked or replaced with the temporary number,
> when appropriate."

- The clearest primary-source confirmation among the three OTAs that message content is
  rewritten in transit. Documented filtering covers phone numbers; no report of numeric door
  codes being filtered.

> For the analysis of _why delivery started failing around mid-June 2026_ (the DMARC
> enforcement cliff and per-channel reachability), see
> [delivery-failure-analysis.md](./delivery-failure-analysis.md).

## Cross-channel synthesis

- The Lynx email failures are **structural, not intermittent**: Airbnb guests are unreachable by
  email at all; Expedia guests only from validated EPC sender accounts with no allowlist;
  Booking.com is the single channel with a portal fix (approved-sender registration — recommended
  regardless of this project, with the block-all-email and link-filter settings checked at the
  same time). Agoda, encountered incidentally, has similarly masked guest emails since ~2020.
- **Messaging through the connected booking platform (the PMS path)** is the only route all
  three channels treat as first-class — the route lock-link uses.
- Template rules confirmed for our messages: **no links** (Booking.com stripping), **no phone
  numbers** (Airbnb rewriting); plain numeric codes have no documented filtering on any channel.
