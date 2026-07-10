# Questions for Lynx support

A sendable list for the property's Lynx account owner. Ordered by priority; each notes why it
matters so a vague answer is easy to spot. Written after the OTA / PMS / middleware research
(see the other files in this folder), which answered or retired several earlier questions — the
OTA delivery failures turned out to be structural on the platform side, so "is a delivery fix
planned?" is no longer the right question.

The single most important one is #1.

---

## 1. Does Lynx actually send access codes to Lodgify?

Your Lodgify integration page states:

> "Lynx sends Lodgify guest access codes as well as real-time alerts to change the status of the
> stay to Check-in/ Out." … "Guests can receive the access information via Lodgify email
> message."
>
> — <https://www.getlynx.co/integrations/lodgify-pms-integration-with-lynx/> (retrieved 2026-07-10)

On this account, across roughly 91 recent bookings, **Lodgify has never received an access code
from Lynx** — the code field on the Lodgify booking is always empty. Please clarify:

- Is code write-back to Lodgify a real, currently-shipping feature?
- If so, why is it not happening on our account — is it broken, gated to a specific plan tier,
  or behind a configuration setting we haven't enabled? How do we turn it on?

## 2. Can Lynx deliver guest messages through Lodgify's messaging (the unified inbox)?

Our OTA delivery problems come down to one thing: the booking platforms (Expedia, Booking.com,
Airbnb) only reliably deliver guest messages sent **through the booking system's own messaging** —
they block or drop outside emails. So instead of Lynx emailing the guest directly, can Lynx send
its guest notifications (the access-code message in particular) **into Lodgify's guest
messaging/inbox**, the way Lodgify's own automated messages are delivered? If Lynx posted the code
message through Lodgify rather than by its own email, it would reach OTA guests through the
channel those platforms actually honor — which would resolve most of the delivery failures we see.
Is this possible today, or something on the roadmap?

## 3. What email address/domain do Lynx guest messages come from?

- Is it a fixed, shared address, or per-account / customizable?
- (We want to add it to Booking.com's approved-sender list, which is the one place a portal
  setting can fix OTA delivery. A per-property sending address would also help with Expedia.)

## 4. Delivery visibility

Does Lynx provide per-message send / bounce / delivery logs — ideally broken out by recipient
email domain? (This would confirm where the OTA-guest emails are being dropped.)

## 5. Provisioning time

- What is Lynx's stated time to provision a new reservation's code onto the locks? (We've
  observed same-day bookings taking 3–4 hours.)
- Once a code is live on the locks, can it ever **change** on its own before checkout?

## 6. Expedia third-party sending

Expedia's documentation says support for non–Partner Central senders (CRM / third-party systems)
is "in the works." Is Lynx tracking this, and would Lynx use it to deliver to Expedia guests
once available?

## 7. Supported API or integration program

Does Lynx offer — or plan to offer — a supported API, webhooks, or a partner/integration program
for building on top of Lynx?
