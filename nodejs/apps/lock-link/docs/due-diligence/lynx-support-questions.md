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
- When it works, does it send **one** code per booking, or can it represent a **different code
  per lock** on the same reservation?

## 2. Can Lynx's own guest emails/SMS be turned off — per property or per channel?

We intend to handle guest code delivery ourselves. If Lynx also emails/texts the guest, direct
guests would receive **two** messages. Can Lynx's guest notifications be disabled selectively
(e.g. off for OTA bookings, or off entirely) while code provisioning continues?

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
- Can provisioning for a specific reservation be **expedited or manually forced**?
- Once a code is live on the locks, can it ever **change** on its own before checkout?

## 6. The "Emergency Access Code" feature

Lynx's user permissions and lock data reference an **emergency access code**. What is this
feature — how are emergency codes created, managed, and rotated, and can one be given to a guest
as a fallback when their normal code isn't ready in time?

## 7. Task codes and user management

- How many "task notification codes" does our account include, and can we get more?
- When a secondary user is deleted, **how quickly is their PIN removed from the physical
  locks**, and is there any way to confirm it has been removed? (We plan to manage
  staff/temporary users more actively.)

## 8. Expedia third-party sending

Expedia's documentation says support for non–Partner Central senders (CRM / third-party systems)
is "in the works." Is Lynx tracking this, and would Lynx use it to deliver to Expedia guests
once available?

## 9. Supported API or integration program

Does Lynx offer — or plan to offer — a supported API, webhooks, or a partner/integration program
for building on top of Lynx?
