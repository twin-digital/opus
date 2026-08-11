---
'@grinbox/server': minor
'@grinbox/web': minor
'@grinbox/shared': minor
---

Notification kinds and cooldowns, the digest's second rendition, and money in display form (grinbox 009).

- A notify operator may name a notification kind; the user sets a per-kind minimum interval
  (whole seconds) from the new cooldown settings surface, and a push inside the interval is
  suppressed — recorded as its own `resource_op_suppressed` outcome naming the push it
  deferred to, resolvable across messages. Cooldown changes write the change log.
- A digest is delivered as one mail in two renditions: the plain text as before, plus a
  self-contained rich rendition (escaped throughout, translucent colouring only, threshold
  marks styled rather than suffixed). The send operation takes the optional rich rendition;
  a backend without alternatives sends plain text alone.
- Extracted money values render in display form — `$195.03`, `CHF 1,234.56` — in digests and
  everywhere the interface shows a money-typed tag, from one shared formatter; stored values
  and threshold inputs stay in the normalized form.
