## 🗺️ Snavio Messaging Platform — Development Roadmap

### 🔰 Phase 0: Bootstrapping & Foundations (Week 1)

**Goals:** Prove concept viability, unblock R&D teams, ship something usable.

| Component         | Tasks                                                             | Owner | Notes                                                   |
| ----------------- | ----------------------------------------------------------------- | ----- | ------------------------------------------------------- |
| `@snavio/client`  | Build `makeCommandSender()` with HMAC signing, metadata injection | Core  | Simple config: target + shared secret                   |
| Event Schema      | Finalize `CommandMessage` shape                                   | Core  | Includes `metadata`, `command`, no `source` from sender |
| Dispatcher Lambda | Create base handler with validation, basic SQS routing            | Core  | Static JSON config for routing, no DDB yet              |
| Infra             | Provision EventBridge bus, basic DLQ                              | Core  | Terraform or CDK preferred                              |
| Example Flow      | Set up one producer → one target → queue → consumer               | Core  | Used for demos, testing                                 |

### 🚀 Phase 1: Routing Engine & Registry (Week 2)

**Goals:** Replace static config with dynamic registries, support basic ACL enforcement.

| Component               | Tasks                                                   | Owner | Notes                              |
| ----------------------- | ------------------------------------------------------- | ----- | ---------------------------------- |
| Routing Registry        | Create DDB table for (target, command.name) → queue ARN | Core  | Add TTL + optional metadata        |
| ACL Registry            | DDB table for (source, command, target) tuples          | Core  | Include TTL + sensitivity profile  |
| Dispatcher Enhancements | Add registry lookups + in-memory caching                | Core  | No refresh-on-stale logic yet      |
| CLI                     | Add `register-route` + `register-acl` commands          | Core  | Output dry-run + validation report |
| Observability           | Emit metrics for valid/invalid/denied commands          | Core  | CloudWatch counters only           |

### 🔐 Phase 2: Security & Replay Protection (Week 3)

**Goals:** Lock down identity, prevent replay, enforce ACLs rigorously.

| Component              | Tasks                                         | Owner  | Notes                             |
| ---------------------- | --------------------------------------------- | ------ | --------------------------------- |
| IAM Policy Enforcement | Require `events:source == service tag`        | SecOps | Enforced at producer level        |
| HMAC Verification      | Add versioning, load keys from SSM            | Core   | Support for v1 + v2 grace periods |
| Replay Window          | Reject commands outside ±60s timestamp window | Core   | Configurable per environment      |
| Failure Events         | Emit `snavio.command.failed` and `invalid`    | Core   | Include backoff hints             |

### 🧠 Phase 3: Caching + Cold Start Optimization (Week 4–5)

**Goals:** Improve warm path latency, support cache TTL enforcement and partial refreshes.

| Component                   | Tasks                                                 | Owner | Notes                                    |
| --------------------------- | ----------------------------------------------------- | ----- | ---------------------------------------- |
| Registry Caching            | In-memory cache with 3-tier TTL (fresh/stale/expired) | Core  | Configurable with jitter                 |
| ACL TTL Strategy            | Add per-entry TTL + refresh-on-expiry logic           | Core  | Block if expired, async refresh if stale |
| DDB Stream Audit (optional) | Attach stream to registries for audit                 | Infra | Logged to S3 or CloudTrail               |
| Control Event Handling      | Trigger refresh on `snavio.registry.updated`          | Core  | Push invalidation support                |

### 📈 Phase 4: Rate Limiting (Week 5–6)

**Goals:** Implement soft global rate enforcement without hot path I/O.

| Component           | Tasks                                   | Owner | Notes                         |
| ------------------- | --------------------------------------- | ----- | ----------------------------- |
| Rate Config Table   | DDB table for (source, command) limits  | Core  | TTL per entry optional        |
| Post-Dispatch Check | Background DDB write after command send | Core  | Add to denylist if over-limit |
| Denylist Handling   | In-memory list with periodic TTL        | Core  | Shared via DDB on cold start  |
| Metrics             | Emit rate-limit events and counts       | Core  | `SnavioRateLimit.*` metrics   |

### 🔬 Phase 5: Monitoring & Alerting (Week 6+)

**Goals:** Ensure visibility, safety, and fast feedback during incidents.

| Component         | Tasks                                                | Owner  | Notes                              |
| ----------------- | ---------------------------------------------------- | ------ | ---------------------------------- |
| Route Monitor     | Lambda polls queues, checks `expected_drain_seconds` | Core   | Flags backlogs, no-consumer states |
| Metrics Dashboard | Prebuilt views for latency, failures, volume         | DevEx  | Publish to Grafana or CloudWatch   |
| Alerting Policies | Define alerts for missed queues, rate abuse          | SecOps | Scoped per team/service            |

---

## 🧩 Stretch Goals / Future Enhancements

- ❄️ Per-team rate profiles (e.g., trial, gold-tier)
- 🕵️ Registry signature validation (tamper detection)
- 🧰 snavio-replayer tool with HMAC regeneration
- 🧪 Schema validation integration pre-dispatch
- ☁️ Self-hosted or SaaS deploy option with UI onboarding

---

Let me know which tasks to prioritize for the next sprint, and I’ll build out JIRA-ish tickets or implementation scaffolds.
