---
'@twin-digital/design-process': minor
---

Support the `deferred` decision status (decisions sources at version 2). A deferred decision
stays in force for citations but is not coverable: `check` rejects a coverage entry naming one
(`record-covers-deferred`) and no longer counts an omitted deferral as a coverage gap, and
`show` counts deferred entries beside the rulings while excluding them from the coverage
section, its summary naming how many were excluded.
