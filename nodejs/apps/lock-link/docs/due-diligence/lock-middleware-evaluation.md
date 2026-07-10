# Lock middleware evaluation: alternatives to Lynx for the dormakaba Saffire EVO

Compiled 2026-07-10 via multi-source research with adversarial verification (claims below
survived 3-vote verification panels against vendor-primary sources unless noted). Supports the
"replace Lynx" alternative analysis in [proposal.md](../proposal.md). The decisive requirements:
(a) drives the Saffire EVO via dormakaba's Lyazon cloud, (b) syncs reservations from **Lodgify**,
(c) per-reservation guest PINs with change/cancel handling, (d) exposes or delivers the code,
(e) sane pricing at 4 units.

## The platform constraint (verified 3-0, seven merged claims)

The Saffire EVO (LZ and VR series) connects via onboard Wi-Fi to dormakaba's **Lyazon** cloud.
Lyazon is a **REST-API-only platform with no end-user management UI** — dormakaba ships only a
commissioning-scoped "Lyazon Utility" app, and its own materials state the locks "are managed by
third party software partners" with "aggregator partners control[ling] the front end." The lock
cannot be managed standalone; some integration partner is mandatory. (Sources:
[Lyazon](https://go.dormakaba.com/en/lyazon),
[Saffire EVO VR](https://go.dormakaba.com/saffire-evo-vr),
[dormakaba newsroom, March 2025](https://www.dormakaba.com/us-en/newsroom/dormakaba-saffire-evo-smart-lock-flexible-connectivity).)

## The field

Candidates swept: RemoteLock, Lynx, Seam, SuiteOp, Operto, Jervis Systems, Chekin, Duve, Enso
Connect, PointCentral, Brivo, plus dormakaba's own Saffire EVO VR partner page (~40 names —
marketing-grade and loose: it lists VRBO and Vacasa, so inclusion is weak evidence of a working
integration and exclusion equally weak the other way).

**Verified Saffire EVO/Lyazon support exists for exactly two platforms: Lynx and RemoteLock.**

| Requirement                  | Lynx (current)                                                                                                                                      | RemoteLock                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Saffire EVO via Lyazon   | ✅ Own installer guide (updated 2026-03)                                                                                                            | ✅ Official KB flow (Lyazon Utility → import); PIN + RFID today, BLE/ACoD "coming soon"                                                                                                                                            |
| (b) Lodgify reservation sync | ✅ **Native two-way** (verified against Lynx, Lodgify docs, and this property's live data)                                                          | ❌ **None**: Lodgify roadmap card removed; partner page is "Powered by ChargeAutomation" (a middleware-on-middleware bridge); direct path is generic iCal, where Lodgify feeds carry a documented duplicate-events incompatibility |
| (c) Per-reservation PINs     | ✅                                                                                                                                                  | ✅ (incl. via iCal path, where it works)                                                                                                                                                                                           |
| (d) Code exposure/delivery   | ✅ Own email/text/portal + `keyCodes` write-back into Lodgify                                                                                       | ✅ Own guest emails + PMS variables — but only into PMSs it integrates with (not Lodgify)                                                                                                                                          |
| (e) Pricing at 4 units       | **~$60/mo** — dormakaba locks require the Enterprise tier ($15/property/mo; account-wide, no plan mixing; Lodgify itself is supported even on Lite) | **~$24–72/mo** — Premium from $6/door/mo annual, Enterprise from $12; "from" is a floor (specialty locks +$2/door)                                                                                                                 |

**Everything else is out on documentation grounds:**

- **Seam** — appears on dormakaba's partner page, but Seam's own docs cover **Oracode Live
  only** (plus the older Saffire LX-M device page); no Saffire EVO/Lyazon documentation exists.
  Excluded pending direct confirmation from Seam.
- **SuiteOp, Operto, Chekin, PointCentral, Brivo** — no vendor-documented Saffire EVO/Lyazon
  support found anywhere.
- **Jervis Systems, Duve** — on dormakaba's partner page but not deep-dived: Jervis is the
  platform the property already migrated away from (Tuya-era provisioning failures), and Duve is
  a guest-experience layer, not a Lodgify-connected lock manager. Neither documents Lodgify
  support.

## Key conclusions

1. **The "$1,000+/month alternatives" framing is wrong — and the truth is stronger.** The real
   Lyazon-capable alternative (RemoteLock) costs $24–72/month at this scale. Alternatives are
   not prohibitively expensive; they are **prohibitive on capability**: no platform except Lynx
   has a native Lodgify connection, so "replace Lynx, keep Lodgify" has no off-the-shelf
   solution at any price. Replacing Lynx therefore implies _also_ replacing the PMS — which
   collapses into the switch-PMS alternative already evaluated
   ([pms-evaluation.md](./pms-evaluation.md)).
2. **No platform documents automatic fallback/backup-code provisioning** as a first-class
   feature (absence-of-evidence finding — nothing in any examined doc describes it; RemoteLock
   documents failure _notification_ only). The emergency-code subsystem in this build is
   genuinely differentiating, not a re-implementation of a commodity feature.
3. **Lynx pricing correction for the cost model**: dormakaba locks sit in Lynx's Enterprise
   tier only — $15/property/month, account-wide — so the property's Lynx cost is ~$60/month,
   not the $6 Lite figure.

## Refuted along the way

- A claimed exact 12-partner Lyazon list (1-2 vote — the partner page is larger and looser).
- "RemoteLock lists Lodgify in its integration directory" as evidence of a partnership (1-2 —
  the page exists but routes through ChargeAutomation; not a native integration).
