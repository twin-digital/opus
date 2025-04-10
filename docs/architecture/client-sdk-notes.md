**SNAVIO CLIENT LIBRARY & SDK COMPANION NOTES**

Author: Lead Dev
Audience: SDK maintainers, platform engineers, service integrators
Format: plaintext (no links, no markdown)

---

## OVERVIEW

To minimize integration errors, accelerate adoption, and enforce consistency across services, the Snavio platform must ship and maintain SDKs or client libraries for common use cases.

This document outlines the requirements, responsibilities, and initial implementation guidance for those SDKs, as well as notes on testing, rollout, and long-term maintenance.

---

## SDK SCOPE

The client SDK is not a full framework. It should:

- Abstract HMAC generation (including key versioning)
- Enforce command envelope format
- Validate payload and metadata structure
- Handle EventBridge publishing with correct IAM-assumed `source`
- Provide optional auto-retry with dispatcher backoff hints
- Emit metrics or logs (pluggable)

The SDK does **not**:

- Own retry queues
- Interpret failures beyond rate-limiting hints
- Implement replay logic
- Manage command routing or registration (dispatcher concern)

---

## TARGET SDKs

Initial target languages:

- Python (Lambda, backend services)
- Node.js (bots, some frontend backends)
- Go (infra tools, telemetry services)
- Java (legacy consumers)

Language-specific nuances (e.g., crypto libraries, JSON canonicalization) must be tested explicitly.

---

## CORE SDK RESPONSIBILITIES

1. BUILDING A VALID COMMAND ENVELOPE

- Inject required metadata: id (UUID), timestamp (ISO8601), type = snavio.command-sent
- Compute HMAC: SHA-256 over [payload + timestamp + command.name] using current service key
- Attach `version_id` used to sign the HMAC
- Validate that `command.source` is NOT set by caller

2. SENDING COMMAND

- Wrap AWS EventBridge client or provide a publish interface
- Automatically populate `source` from environment (e.g., env var `SNAVIO_SOURCE_SERVICE`)
- Handle IAM credentials through standard SDK chaining (don’t abstract AWS creds)

3. RETRY HINT HANDLING (OPTIONAL)

- If dispatcher returns `snavio.command.failed` with reason = rate-limit-exceeded
  - Parse backoff_hint: `retry_after_ms`, `throttle_until`
  - Optionally apply delay or log structured event

4. VALIDATION

- Preflight envelope structure before send
- Provide helper to validate payload against registered schema (pluggable)

5. LOGGING + OBSERVABILITY (PLUGGABLE)

- Allow injection of logger or metrics sink
- Track success/failure metrics by (target, command.name)
- Optional debug logging of signed envelope

---

## KEY MANAGEMENT

- SDKs fetch signing key from local environment or key loader hook
- Keys are versioned (e.g., hmac-v1, hmac-v2)
- SDK must support multiple active versions for signing (future-proofing, but default to latest)
- SDK should not fetch keys over network at runtime

---

## ENVIRONMENT EXPECTATIONS

- SNAVIO_SOURCE_SERVICE = service-name
- SNAVIO_HMAC_SECRET = base64-encoded HMAC key or path to key file
- SNAVIO_HMAC_VERSION = hmac-vN
- SNAVIO_EVENT_BUS_NAME = snavio-bus (default)

---

## SDK TESTING REQUIREMENTS

Each SDK must ship with:

- Unit tests for HMAC logic (with known fixtures)
- Fixture-backed tests for envelope construction
- Integration test harness using EventBridge in test account
- Replay protection test (timestamp outside window = rejected)

Optional:

- Golden test cases synced across languages to ensure envelope equivalence

---

## CI/CD AND VERSIONING

- SDKs should follow semver
- Initial release = 0.x (pre-GA)
- Stable release = 1.0.0 once 3 services integrate successfully
- Publish to internal package registries (e.g., Artifactory, CodeArtifact)
- Each SDK repo must include changelog and upgrade notes

---

## FUTURE CONSIDERATIONS

- Support for multi-command batches
- Transport-specific wrappers (e.g., SQS or SNS fallback)
- CLI signer for non-programmatic use cases (e.g., replays, manual sends)
- Replay tool integrations (once `snavio-replayer` is live)

---

## APPENDIX A: COMMAND ENVELOPE STRUCTURE

{
metadata: {
id: <uuidv4>,
timestamp: <ISO8601>,
type: "snavio.command-sent",
hmac: <HMAC-SHA256>,
version_id: "hmac-v2"
},
command: {
name: "delete-user",
target: "auth-service",
payload: {
user_id: "1234"
}
// NO source field allowed here
}
}

---

## APPENDIX B: FAILURE RESPONSE (for rate-limit)

{
type: "snavio.command.failed",
reason: "rate-limit-exceeded",
backoff_hint: {
retry_after_ms: 30000,
throttle_until: "2025-04-03T12:30:15Z"
}
}

---

END OF DOCUMENT
