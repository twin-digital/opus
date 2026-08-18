---
'@twin-digital/credential-shelf-trigger': patch
---

Re-present the outstanding device-code prompt when a refresh is throttled. Losing the page (or
re-tapping) after triggering a refresh used to strand the operator behind the rate limit with no
way to recover the pending verification code. The limiter guards _starting_ device-auth flows;
re-showing one already awaiting approval is free — the shelf's refresh handler is single-flight.
So a throttled refresh now probes `/status`: if `refresh_pending`, the trigger relays anyway and
returns the in-flight prompt marked `in_flight: true`, which the operator page renders with an
"outstanding request" banner. Only a throttled request with nothing pending still gets the 429.
