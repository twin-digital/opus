---
'@twin-digital/lock-link': patch
---

- Extend the "reject empty/whitespace envs" hardening to string envs too (`LOCK_LINK_USER_ID` and the three `*_PARAM` names). Previously only numeric envs used `.trim().min(1)`; a whitespace-only user id would have propagated to Lynx as `hostId`, and whitespace param names would have failed later at SSM `GetParameter` with a less-clear error.
- Correct the misleading `TTL_SECONDS` justification comment in `secrets.ts`: the Powertools cache is keyed by parameter name and is NOT invalidated by a downstream 401 — the Lynx re-mint path re-issues the JWT with the same cached credentials, so a secrets rotation is stale for up to one TTL and cannot self-heal. The comment now says so and points to a cold-start as the manual mitigation.
