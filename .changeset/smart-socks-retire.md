---
'@twin-digital/dolmenwood': patch
'@twin-digital/refbash': patch
---

add support for wandering monsters to delve automation

- Delve configuration includes check frequency and wandering monster chance
- As time advances, wandering monster checks are automatically performed based on the configuration
- Pressing 'w' will perform an ad-hoc wandering monster check in the current turn
- If the check indicates a wandering monster appears, an encounter is created in the turn
