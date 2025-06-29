#!/usr/bin/env bash
set -euo pipefail

# default stage to your UNIX username if unset
STAGE=${STAGE:-${USER_ID}}
export STAGE

# select or create workspace
terraform workspace select "$STAGE" 2>/dev/null || \
  terraform workspace new "$STAGE"

# apply
terraform apply \
  -var="stage=$STAGE" \
  -var="region=us-east-1" \
  -auto-approve
