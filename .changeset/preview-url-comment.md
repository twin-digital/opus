---
---

ci: deploy-preview posts an upserted PR comment when a preview stage deploys — listing each deployed service's public endpoint (read from the stage's CloudFormation stack outputs), the deployed commit, and a link to the run. A hidden marker keeps it to one self-updating comment per PR. Purely cosmetic (failures downgrade to a warning); teardown still keys on the `preview-deployed` label, never this comment.
