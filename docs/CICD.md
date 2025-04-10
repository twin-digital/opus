# 🛠 CDK Artifact Deployment Architecture (v1.16)

This document describes the design and implementation plan for artifact-based deployment of CDK-managed infrastructure across multiple services and environments, incorporating metadata tracking, Step Function-based orchestration, and a resilient fallback mechanism.

---

## Overview

This architecture supports multi-service, multi-environment deployment with the following characteristics:

- Artifact-based: CDK artifacts are synthesized in CI and treated as immutable deployment versions
- Version-pinned: CDK CLI, libraries, context, and build environments are fully locked and versioned to ensure deterministic synthesis
- **Context-preloaded**: `.cdk.context.json` is pre-generated in a secure environment, signed, and stored in S3; it is injected into builds to prevent dynamic AWS lookups
- Separation of responsibilities: Build/test/deploy steps are clearly separated, with promotion occurring only after validation
- Event-driven orchestration: All pipeline stages are orchestrated via AWS Step Functions, not imperative scripts, and triggered by an initial artifact upload from CI (with fallback sweeper)
- Centralized deployment tooling: A central account owns orchestration and deploy logic; individual service accounts expose narrowly scoped roles
- Metadata-aware: Deployment state, artifact metadata, version history, and target regions are tracked in DynamoDB for rollback, auditability, and traceability
- State-authoritative: Step Functions serve purely as orchestration engines. All durable state, including deployment status and version history, is stored in DynamoDB. No Step Function execution history is used for audit or state recovery.
- Single-region enforced: All deployments and orchestration run in a fixed AWS region (e.g., `us-east-1`) for simplicity and reliability
- Solo-operator hardened: All sensitive operations simulate dual control using cryptographic signatures, immutable audit logs, and tamper-evident override flows to ensure trust and reproducibility in a single-actor model
- Hardened CI: The deployment chain assumes trust in a tightly controlled CI pipeline, which produces and cryptographically signs artifacts. While a detached signing service offers stronger isolation, it was deemed operationally infeasible at current scale.

---

## Hardened CDK Context Handling

To eliminate risks associated with lookup poisoning and environmental drift, all CDK synth operations use **pre-generated, immutable `.cdk.context.json` files**, stored in S3 and cryptographically validated before use.

### ❌ Git Commit Policy

> `.cdk.context.json` must **never** be committed to the repository. All synths use context injected from a blessed, pre-signed source.

CI pipelines fail if any PR attempts to add or modify this file.

### ✅ Context Generation Process

1. A dedicated CDK app (`context-generator/`) performs `fromLookup()` calls for environment-specific resources (e.g. VPCs, AZs).
2. The context file is synthesized in a secure, audited pipeline (e.g., tools account CodeBuild job).
3. The `.cdk.context.json` is:

   - Validated for determinism (i.e. generated multiple times and hashes compared)
   - Hashed (`SHA256`)
   - Optionally signed using KMS or GPG
   - Uploaded to versioned, KMS-encrypted S3:

     s3://cdk-contexts/{env}/{date}.context.json

4. Associated files (signature, hash manifest) are uploaded alongside the context:

   s3://cdk-contexts/{env}/{date}.context.sha256
   s3://cdk-contexts/{env}/{date}.context.json.asc

### 🔐 S3 Storage Requirements

- Bucket: `cdk-contexts`
- Settings:
  - Versioning: enabled
  - Default encryption: KMS (`alias/cdk-contexts-bucket-key`)
  - Optional: Object Lock for regulatory immutability
- IAM:
  - Write permissions only granted to context generator role
  - Read-only for CI artifact builder
  - Deny `s3:DeleteObject` except for security automation

### 🔄 Context Usage in CI

CI pipelines must:

1. Pull the blessed context file:

   aws s3 cp s3://cdk-contexts/prod/latest.context.json .cdk.context.json

2. Validate hash if required:

   sha256sum -c latest.context.sha256

3. Run deterministic synth with preloaded context:

   cdk synth

Builds are rejected if:

- `.cdk.context.json` differs from expected
- No blessed context is found
- The file is committed in source control

---

## Build Process (GitHub Actions)

- Triggered on push to `main`
- All commits to `main`:
  - Must be GPG- or KMS-signed
  - Must go through PR review, even for solo operator
  - Must pass branch protection rules (no force-push, no direct commit)
- Uses version-locked CDK toolchain:

  - CDK CLI version is pinned via project-local `package.json`
  - All CDK libraries are locked via `package-lock.json`
  - `.cdk.context.json` is **injected from S3**, never committed
  - CI validates context hash and fails if mismatched or mutated
  - The full `cdk.json` and CDK project root is committed and fingerprinted

- Runs `cdk synth` for all changed services
- Publishes resulting CDK `cdk.out/` to the candidate artifact bucket:

      s3://cdk-artifacts-candidate/{service}/{commit_sha}/

- Upload Requirements (CI Runner):

  - All CloudFormation templates, assets, and manifests in `cdk.out/`
  - Assets must already be uploaded to asset S3 buckets or ECR repos
  - CI is responsible for `cdk-assets publish-all`
  - Assets use deterministic naming based on content hash (`assetHashType: "custom"`) to prevent drift

- Computes and stores artifact SHA256 hash
- Generates and signs a **cryptographic manifest** of the build:

      File: artifact-manifest.json
      Fields:
        - commit: full Git commit SHA
        - git_signature_verified: true
        - artifact_sha256
        - cdk_cli_version
        - cdk_context_hash
        - file_hashes: map of each file in cdk.out/ → SHA256
        - build_time
        - signing_identity: "kms:alias/cdk-ci-artifact-signer" or equivalent
        - signature: base64-encoded KMS or GPG signature of the manifest

- Writes the signed manifest to the candidate bucket alongside the artifact:

      s3://cdk-artifacts-candidate/{service}/{commit_sha}/artifact-manifest.json

- Writes artifact metadata to DynamoDB:

      Table: cdk-artifact-metadata
      Key: { service, commit_sha }
      Attributes:
        - build_time
        - build_duration_seconds
        - git_commit
        - commit_signature_verified: true
        - artifact_sha256
        - status: "candidate"
        - artifact_url
        - artifact_type: "cdk"
        - cdk_cli_version
        - cdk_library_versions
        - cdk_context_hash
        - target_region: "us-east-1"
        - environment_states: {
            stage: { status: pending, test_status: not_tested, region: us-east-1 },
            prod: { status: not_deployed, test_status: not_tested, region: us-east-1 }
          }
        - previous_commit_sha

- The artifact bucket is hosted in the central `tools` account (single region), with a **candidate-only TTL** policy:
  - Objects under `candidate/` prefix expire after 30 days
  - Promoted artifacts in the release bucket are **exempt from TTL** and considered permanent unless manually retired

---

## Artifact Signing Policy

To detect post-build tampering and assert artifact provenance, each artifact must be accompanied by a signed manifest generated at build time by CI.

### 📄 Manifest Requirements

Each manifest must include:

- `commit`: Full Git commit SHA of the source repo
- `git_signature_verified`: Boolean
- `artifact_sha256`: SHA256 hash of the top-level `cdk.out/` folder
- `cdk_cli_version`: Version string (e.g. `2.126.0`)
- `cdk_context_hash`: SHA256 of `.cdk.context.json`
- `file_hashes`: `{ relative_path: sha256 }` of every file in `cdk.out/`
- `assets`: `{ logicalId: { hash: sha256, s3Uri?, ecrUri? } }` for every CDK asset
- `build_time`: ISO8601 UTC string
- `build_duration_seconds`: Numeric
- `signing_identity`: e.g. `"kms:alias/cdk-ci-artifact-signer"`
- `signature`: Base64-encoded detached signature (KMS or GPG)

This manifest is uploaded alongside the artifact and must be verified before any deploy operation proceeds.

### 🔒 Signature Validation Logic (in Deployment Pipeline)

Before deployment, the Step Function verifies:

1. Manifest presence and structure
2. Validity of cryptographic signature using trusted CI key
3. That `git_commit`:
   - Was signed (`git_signature_verified: true`)
   - Originated from `main`
   - Is referenced in the corresponding artifact metadata
4. That **every file in `cdk.out/` matches the manifest hashes**
5. That `artifact_sha256` matches value in DynamoDB
6. That `.cdk.context.json` hash matches declared input
7. That the CDK CLI version used matches approved versions

If any of these validations fail, deployment is aborted and an `InvalidArtifact` event is emitted.

---

## Acknowledgement of CI Trust Boundary and Detachment Plan

This architecture **explicitly trusts a hardened CI pipeline**, including GitHub Actions **hosted runners**, to synthesize and sign CDK artifacts. While this trust model is acceptable at current scale and risk tolerance, it does **not** constitute a fully trustless deployment system.

### 🚨 Security Limitation

> GitHub-hosted runners are multi-tenant, ephemeral compute environments. They share underlying infrastructure with untrusted workloads and **do not provide hardware-level isolation**. As such, the signing keys and generated artifacts—while verified and auditable—are still exposed during build time to infrastructure not owned or controlled by this team.

> This is an accepted risk given current team size, operational complexity, and cost constraints. All production-bound artifacts are signed, verified, and content-addressable, **but the signer is not isolated**.

### Justification

- Signing key is scoped to minimal privileges (artifact manifest signing only)
- Signing is enforced in CI via KMS; secrets never enter workflows unencrypted
- CDK output is reproducible with deterministic inputs; hash mismatches are rejected at deploy time
- All downstream deploy stages validate:
  - Commit signature
  - Artifact content hashes
  - CDK version and context hash
  - Signature validity against trusted signer identity

---

## Migration Path to Trustless Architecture

This design is **intentionally structured** to allow incremental adoption of a detached, trust-minimized signer or re-synthesizer when justified by threat exposure or team scale.

The following architectural features enable this migration:

### 🔐 Artifact Determinism and Verifiability

- All CDK synth operations are deterministic:
  - `.cdk.context.json` is locked and committed
  - CDK CLI and dependencies are version-pinned
  - Build is blocked on context mutation or non-reproducible output
- Artifacts are signed and hashed at file level (`cdk.out/` contents and manifest hash)
- Deployment pipeline enforces strict hash matching against metadata and manifest

### 🧱 Stateless Deployment

- All deployments are driven from pre-synthesized, immutable artifacts
- No `cdk deploy` operations are used post-build; only `cloudformation deploy`
- Step Functions and CodeBuild simply deploy validated templates; they **do not trust** CI runtime state

### 🔄 Drop-In Detached Verifier Option

When needed, a detached signer can be introduced as follows:

1. **Isolated Verifier Infrastructure** (e.g., in tools account):

   - Receives artifacts from CI via cross-account transfer
   - Re-synthesizes CDK using locked context + pinned versions
   - Validates hashes match original manifest
   - Generates and signs a **second manifest** using an offline or tightly scoped KMS key

2. **Deployment Pipeline Modification**:

   - Require presence of both CI and verifier signatures
   - Accept deploy only if **both signatures** validate and hashes match

3. **Optional Enhancements**:
   - Run verifier inside deterministic Docker/Nix environment
   - Store verified artifacts in a separate `verified/` S3 prefix
   - Require promotion from `candidate/` to `release/` only if verifier manifest is present

This migration can be implemented without changing core orchestration, artifact format, or metadata tracking—ensuring **no need to retool the pipeline** to move to a higher-trust model later.

---

## GitHub Actions CI Security Hardening

To secure the CI pipeline against common attack vectors and insider threat scenarios, the following policies and controls are enforced:

### 🔐 Workflow Trust Boundaries

- **`pull_request_target` is disabled** across all workflows to prevent untrusted PRs from running in elevated contexts
- All third-party GitHub Actions must be used by **pinning to commit SHA**, not tag (e.g., `@v3` is disallowed; `@<commit-sha>` required)
- **Manual approval is required** for workflow runs triggered by first-time contributors or any contributor without recent approval history
- Only selected trusted workflows can access repository secrets or invoke sensitive deployment operations

### 🔐 Trigger Scope & Isolation

- Workflows are restricted to trigger **only on `push` to `main`** and **approved `workflow_dispatch`**
- No scheduled (`cron`) or fork-based events are permitted to initiate workflows with deployment privileges
- Reusable workflows (`workflow_call`) are scoped to internal use only and version-controlled

### 🔐 IAM Role & OIDC Scope Enforcement

All GitHub Actions access to AWS uses **OIDC federated authentication**, not static credentials. The following conditions apply:

- IAM roles include:
  - **`Condition` block on `aud`** claim (must be `sts.amazonaws.com`)
  - **Scoped `sub` claim** that binds to the exact GitHub repository and workflow identity
  - Optional `StringEquals` constraint on `repository` and `workflow` claims
- IAM permissions are **strictly bounded** to:
  - Asset publication (`s3:PutObject`, `ecr:BatchCheckLayerAvailability`, etc.)
  - No access to `cloudformation:*`, `ssm:*`, or `iam:*`
- Role sessions are **time-limited to ≤15 minutes** and auditable via CloudTrail

### 🔐 Secrets & Execution Environment

- GitHub Actions secrets are not available to untrusted workflows
- Secrets are never passed via environment variables into dynamic shell steps
- All CDK build steps are sandboxed, and artifact publication occurs only after signature and hash verification

---

## Stage Deployment + Testing

- Triggered via S3 ObjectCreated in the candidate bucket _or_ by the periodic artifact sweeper (see relevant section below).
- Initiates the `DeployArtifactPipeline` Step Function in the central tools account.

The pipeline:

- Validates artifact structure, metadata, and SHA256 integrity
- Assumes the deploy role in the stage account
- IAM Boundary: The assumed role is restricted to deploying specific stacks only:
  - IAM policy restricts `cloudformation:*` actions to specific stack name prefixes and resource ARNs
  - Denies the ability to modify or delete shared/global infrastructure
  - No wildcard permissions (`*`) are permitted in any deploy policy
- Uses CodeBuild to run `aws cloudformation deploy` against the pre-synthesized template
  - Role-assumes into the stage account using STS
  - Emits logs to CloudWatch
  - Enforces 60-minute timeout for each phase via Step Function + CodeBuild settings
- On deploy success:

  - Updates metadata:
    - `environment_states.stage.status = deployed`
    - `stage_deploy_duration_seconds`
  - Triggers CodeBuild to run service-specific tests (integration, functional, etc.)
  - On test success:

    - Updates metadata
      - `environment_states.stage.test_status = test_passed`
      - `stage_test_duration_seconds`
    - Promotes the artifact to the release bucket:

          s3://cdk-artifacts-release/{service}/{commit_sha}/

    - Updates metadata:
      - `environment_states.prod.status = pending`
      - `environment_states.prod.test_status = not_tested`
      - `lifecycle_status = promoted`
      - `last_known_good_commit = commit_sha`
    - Emits `ArtifactPromoted` event

  - On test failure:
    - Updates metadata
      - `environment_states.stage.test_status = test_failed`
      - `lifecycle_status = rejected`
    - Emits failure event

- On deploy failure:
  - Updates `environment_states.stage.status = failed`
  - `lifecycle_status` remains `candidate`
  - Emits a `DeployFailed` event

Manual requeue or override requires:

- Requires permissions to and invocation via manual override tool (lambda function or similar)
- Signed JSON justification (KMS or GPG)
- Signature validation by orchestrator
- Emits `OverrideRequested` and `OverrideApplied` events

---

## Production Deployment + Smoke Testing

### Summary:

- Fully automated if tests pass in stage
- Triggered via S3 release artifact upload or artifact sweeper
- Enforces:
  - Artifact SHA256 matches metadata
  - Commit was signed and verified in CI
  - All deploy/test logic enforced through Step Function with 60-minute max per phase
  - **Step Function execution is non-authoritative**; all durable state resides in DynamoDB.

### Execution:

Triggered via S3 release artifact upload or explicit manual promotion, the `DeployArtifactPipeline` handles:

- Assumes the prod deploy role
- IAM Boundary: The prod deploy role is tightly scoped:
  - Only allows `cloudformation:CreateChangeSet`, `ExecuteChangeSet`, and `Describe*` for whitelisted stack ARNs
  - No permissions to update SSM parameters, IAM, or other privileged global resources unless explicitly needed and audited
  - Uses `Resource: arn:aws:cloudformation:...:stack/myapp-prod-*` style scoping
  - All permissions are time-bound via STS session and logged via CloudTrail and AWS Config
- **Runs pre-deploy stack drift detection** via `cloudformation detect-drift`:
  - Aborts if drift is found unless override is signed and authorized
- Deploy uses `aws cloudformation deploy` with enforced `--stack-policy-body`:
  - Protects critical resources from replacement or deletion
  - Stack policy is defined per service and checked into Git
- Validates:
  - Every `cdk.out/` file hash matches manifest
  - Every declared asset hash (S3/ECR) matches on retrieval
- Runs smoke tests via CodeBuild
- Each step enforces 60-minute timeout

On success:

- Updates metadata:
  - `environment_states.prod.status = deployed`
  - `environment_states.prod.test_status = test_passed`
  - `prod_deploy_duration_seconds`, `prod_test_duration_seconds`
  - `global_health_status = healthy`
- Emits success event

On smoke test failure:

- Updates metadata:
  - `environment_states.prod.test_status = test_failed`
  - `status = rollback_initiated`
  - `global_health_status = degraded`
- Attempts rollback, with retry logic:

#### Configurable Rollback Retry Policy

- A systemwide configuration value (`MAX_ROLLBACK_ATTEMPTS`, default: `2`) determines how many rollback attempts are permitted.
- Each attempt uses exponential backoff (base delay: 60s, doubling per attempt).
- Rollback is attempted by:
  - Validating `last_known_good_commit`
  - Fetching the associated artifact from the release bucket
  - Running `aws cloudformation deploy` using that artifact in the prod account

#### Rollback Outcomes:

- If rollback succeeds:
  - Updates metadata:
    - `rollback_succeeded`
    - `environment_states.prod.status = rollback_succeeded`
- If all rollback attempts fail:
  - Updates metadata:
    - `rollback_failed`
    - `rollback_attempts_exhausted = true`
    - `manual_intervention_required = true`
  - Emits critical alert event

Manual promotion/rollback (solo safeguard):

- Requires permissions to and invocation via manual override tool (lambda function or similar)
- CLI + signed justification (e.g. `promotion_reason`, `rollback_reason`)
- Signature verification
- Audit events emitted on invocation, success, failure of operation

---

## Global Artifact Sweeper (Resilience Mechanism)

To prevent missed S3 events or deployment stalls, a scheduled sweeper Lambda runs every 2 minutes:

- Scans DynamoDB for:
  - Artifacts in `status = candidate` with no stage deployment after 5 minutes
  - Artifacts in `status = promoted` where prod status remains `pending` after 5 minutes
- Cross-checks artifact presence in S3
- Emits `SweeperTriggered`, `SweeperCorrected` events for visibility
- Ensures all deployable artifacts are eventually processed, even if events are dropped or delayed

---

## Stuck Execution Handling & Metadata Consistency

While all deployments and test phases are orchestrated via AWS Step Functions, failures or timeouts during execution (e.g., a crash in the orchestrator, an unresponsive CodeBuild job, or delayed IAM propagation) can result in **metadata drift**—where the true infrastructure state does not match the recorded state in DynamoDB.

To handle this, the following mechanisms are in place:

### ⏱ Timeout Enforcement

- All CodeBuild jobs and Step Function phases enforce a **hard 60-minute timeout**
- Step Functions are configured with failure handling logic that emits failure events if timeouts occur

### 🧹 Execution Watchdog (Sweeper Integration)

- The artifact sweeper runs every 2 minutes and:
  - Detects Step Function executions that are **in-flight for >65 minutes**
  - Terminates those executions (using `StopExecution`) and emits a `StuckPipelineTerminated` event
  - Requeues the artifact by resetting the corresponding metadata state in DynamoDB:
    - `status: candidate` for stage
    - `status: promoted` for prod
    - `test_status: not_tested`
  - Ensures the artifact is picked up again by the next sweep iteration

### 🧾 Metadata Finalizer Lambda

- A finalizer Lambda is invoked after every Step Function completes (via success/failure path or event)
- The finalizer:
  - Queries real deployment state via `DescribeStacks`, CodeBuild logs, and deployment artifacts
  - Resolves ambiguous states (e.g., CodeBuild succeeded but metadata wasn’t updated)
  - Ensures DynamoDB reflects the true deploy/test outcome
  - Emits `FinalizerCorrectedMetadata` if inconsistencies are resolved
  - **Also emits a `FinalizerCorrected` metric** for monitoring frequency of metadata inconsistencies

---

## Deployment Metrics and Monitoring

To track system health, regression, and promote visibility, the following metrics are emitted as CloudWatch custom metrics:

- `DeployLatency`: Time from candidate artifact creation → stage deploy → prod deploy
- `RollbackLatency`: Time from test failure → rollback completion
- `FinalizerCorrected`: Count of times metadata had to be patched post-execution
- `ArtifactNeverPromoted`: Count of candidate artifacts older than X days with no promotion
- `TestFailureRate`: Rate of integration/smoke test failures over trailing 7d
- `RollbackFailureRate`: Number of rollback attempts that failed after test failure
- `AssetHashMismatch`: Count of times asset hashes failed validation pre-deploy

These metrics feed alarms and dashboards to detect regressions in CI, service test quality, or deploy reliability.

---

## Metadata Tracking

- All artifacts are recorded in a central **DynamoDB table**:

      Table: cdk-artifact-metadata
      Key schema: { service, commit_sha }

Attributes:

- Global:
  - artifact_sha256
  - artifact_url
  - artifact_type: "cdk"
  - git_commit
  - previous_commit_sha
  - commit_signature_verified
  - status: candidate | promoted | rejected | rollback_failed | rollback_succeeded
  - last_known_good_commit
  - deployment_id
  - target_region
- Per-environment:

      environment_states: {
        stage: {
          status: pending | deploying | deployed | rollback_* | not_deployed,
          test_status: test_running | test_passed | test_failed | not_tested,
          region: us-east-1,
          deploy_started_at, deploy_completed_at,
          test_started_at, test_completed_at,
          deployment_id
        },
        prod: {
          ... same fields ...
        }
      }

- Audit:

  - audit_event_ids
  - manual_override_requested
  - override_signature
  - promotion_reason
  - rollback_reason
  - integrity_verified

- Additional metadata for rollback tracking:

  - rollback_attempts
  - rollback_attempts_exhausted (bool)
  - rollback_backoff_schedule
  - rollback_failure_reason (if known)

- Additional metadata fields for execution tracking and finalizer support:

  - `execution_id`: Step Function execution ARN
  - `execution_started_at`: timestamp of deploy/test orchestration start
  - `execution_completed_at`: timestamp of Step Function completion
  - `execution_status`: running | succeeded | failed | timeout | killed
  - `finalizer_ran`: boolean
  - `finalizer_correction_applied`: boolean (true if metadata was updated by finalizer)

- TTL configuration:

  - `expire_at`: UNIX epoch timestamp (set by default to 90 days from `build_time`)
    - Used by DynamoDB TTL to purge expired or abandoned metadata entries
    - Sweeper logic ensures live entries (e.g., promoted artifacts) are refreshed before TTL triggers

Additional fields added:

- `assets`: map of logical asset ID → `{ hash, s3_uri?, ecr_uri? }`
- `asset_verification_passed`: boolean
- `stack_drift_detected`: boolean (true if drift found pre-deploy)
- `finalizer_corrected`: boolean
- `finalizer_corrected_at`: ISO8601 timestamp

---

## DynamoDB Resilience & Immutability

The DynamoDB table used for artifact tracking is configured for maximum durability and recoverability:

- **Point-in-Time Recovery (PITR)** is enabled to allow full rollback to any second within the last 35 days
- **Export to S3** is scheduled every 6 hours:
  - Exports are written to a versioned, KMS-encrypted S3 bucket
  - Exported data is stored in a `cdk-artifact-metadata-exports/` prefix with timestamped folders
  - Lifecycle policies enforce retention for at least 180 days

These measures ensure metadata state can be restored in the event of regional failure, data corruption, or unauthorized mutation.

### TTL Policies for Metadata Cleanup

- To prevent unbounded metadata growth, each entry in the `cdk-artifact-metadata` table includes an `expire_at` attribute (UNIX timestamp)
- TTL is set to 90 days from the artifact’s `build_time` by default
- Artifacts in a promoted or deployed state are periodically "touched" by the sweeper to extend their TTL
- TTL-based deletion is used only for:
  - Rejected, failed, or expired candidate artifacts
  - Orphaned entries (e.g., build never promoted, deploy never triggered)
- PITR and scheduled S3 export preserve deleted entries for auditability and recovery

---

## Audit Logging & Cryptographic Anchoring

All override actions, manual interventions, and deployment state transitions emit structured audit logs.

To ensure immutability and tamper-evidence, each log entry includes a `previous_log_hash` field, forming a **SHA256-linked hash chain**.

A dedicated finalizer Lambda function runs every 10 minutes to:

- Compute the latest audit chain root hash (i.e., the final SHA256 link in the chain)
- Store the anchor hash to an **append-only, versioned S3 bucket** (`audit-log-anchors/`)
- Emit the anchor hash to **CloudTrail** as a custom event
- **Publish the anchor hash to an SNS topic** (`arn:aws:sns:...:audit-anchor-publish`)

### 📬 Mandatory Anchor Publication Policy

To protect against full AWS environment compromise and ensure forward security:

- The SNS topic **must have at least one external email address subscribed**
  - Example: `security-audit@yourcompany.com`
  - This inbox must reside **outside AWS control** (e.g., GSuite, O365)
- Anchor hashes are **published every 10 minutes**
- The published message must include:
  - Timestamp of last log entry
  - Anchor hash (SHA256)
  - Chain depth (number of log entries)
  - `log_hash` of latest entry
  - Optional summary of recent high-privilege actions (e.g., overrides, rollbacks)

This ensures that even if audit logs are tampered with or rewritten inside AWS, **the externally stored anchor hashes cannot be forged**, and discrepancies will be immediately detectable.

---

## IAM Boundary Model

The deployment architecture relies on strict IAM isolation between:

- The **central orchestration account (tools)** which runs all pipelines
- The **per-service stage and prod accounts**, which expose narrowly scoped cross-account IAM roles

### IAM Roles

#### 🔧 `cdk-context-generator` Role

Used only by the secure context generation pipeline:

- Permissions:
  - `ec2:Describe*`, `ssm:Get*`, `cloudformation:DescribeStacks`, etc. for lookups
  - `s3:PutObject` to `cdk-contexts/*`
  - `kms:Sign` for context file signing (if used)
- Cannot deploy, publish, or synthesize application artifacts
- Access only to target environment

#### 🏗 `cdk-ci-artifact-builder` Role

Used by GitHub Actions CI:

- Permissions:
  - `s3:GetObject` to `cdk-contexts/*` (read-only)
  - `cdk synth` using injected context
  - `cdk-assets publish-all`
  - `s3:PutObject` to artifact buckets
  - `kms:Sign` for artifact manifest only
  - `dynamodb:PutItem` for build metadata
- Cannot:
  - Perform AWS SDK lookups (e.g. `ec2:Describe*`)
  - Upload context files
  - Modify environment resources

---

## Solo-Operator Policy Control Matrix

| Action                              | Mechanism           | Safeguard                                                      |
| ----------------------------------- | ------------------- | -------------------------------------------------------------- |
| Commit to `main`                    | GitHub PR           | GPG/KMS signature + branch protection (PR required, even solo) |
| Deploy to stage                     | Automated           | Artifact hash + CI metadata verified                           |
| Promote to prod                     | On stage test pass  | Artifact must be signed + tested                               |
| Deploy to prod (automated)          | Step Function       | No manual deploys allowed                                      |
| Smoke test + auto rollback          | Automated           | Single rollback only; hash + commit must match known-good      |
| Manual rollback (fallback)          | CLI tool            | Signed reason, validated signature, audit log emitted          |
| Manual artifact promotion / requeue | CLI tool            | Signed justification, verified by pipeline logic               |
| Override gate (break-glass)         | CLI tool + SSM flag | Signed request, log + email alert, justification stored        |
| Edit artifact metadata              | Prohibited          | Only orchestrator Step Function may mutate metadata            |

### Transparency and Trust

- All override and rollback operations are signed, logged, and tamper-evident
- Audit logs are chained cryptographically and anchored externally
- CI pipeline enforces cryptographic commit verification
- All artifacts must pass test gating and hash verification before prod promotion
- Deployment history, metadata, and overrides are queryable via audit dashboard
- No privileged deployment or rollback originates from a developer’s workstation

---

## Summary

This architecture enables secure, scalable, artifact-driven deployment across multiple services and environments. It eliminates direct deploys, centralizes promotion logic, and ensures test-verified, traceable rollouts. It supports solo-operator trust models via signature validation and immutable logs.

All durable state is persisted in DynamoDB. Step Functions are strictly orchestration; execution history is never treated as a source of truth. This guarantees reliability across retries, failures, or replays.

With fallback mechanisms like artifact sweeper, version-pinned CDK builds, and resilient rollback attempts, the system is designed to fail gracefully, recover automatically, and remain auditable under stress.

🧾 CI Trust Addendum

    CI trust is a conscious tradeoff. This system assumes artifact signing in a GitHub-hosted runner is acceptable risk at current scale. However, due to deterministic builds and strict downstream hash validation, it remains verifiable and tamper-evident. Migration to a detached signer is fully supported without structural change, and can be enacted incrementally when operational constraints allow.

---

## Version History

| Version | Notes                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1.7     | Initial version before changes were tracked                                                                             |
| 1.8     | Enhances details of CDK version pinning                                                                                 |
| 1.9     | Clarifies Step Function state authority; adds rollback retry logic                                                      |
| 1.10    | Documents IAM boundary enforcement and cross-account role scoping                                                       |
| 1.11    | Adds DynamoDB resilience and audit log cryptographic anchoring                                                          |
| 1.12    | Adds Gitlab hardening, signed artifact manifest policy and CI trust acknowledgment                                      |
| 1.13    | Augment content on trusted CI and migration plan for detached signer                                                    |
| 1.14    | Stuck job handling, metadata reconciliation, metadata TTL                                                               |
| 1.15    | Expand detail on cryptographic audit log handling                                                                       |
| 1.16    | Overhauls `.cdk.context.json` handling: pre-generated, signed, and consumed via S3 injection                            |
| 1.17    | Adds manifest schema, drift detection, stack policy enforcement, asset hash verification, and FinalizerCorrected metric |
