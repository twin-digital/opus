#!/usr/bin/env bash
set -euo pipefail

# read the same vars you expose to Terraform
: "${AWS_ROLE_ARN:=}"    # set via -var or env TF_VAR_roleArn
: "${AWS_PROFILE:=238287277359-TerraformStateAccess}"

# default stage to your UNIX username if unset
STAGE=${STAGE:-${USER_ID}}
export STAGE

# select or create workspace
# terraform workspace select "$STAGE" 2>/dev/null || \
#   terraform workspace new "$STAGE"

# common backend args
args=()

# choose ROLE vs PROFILE for the backend
if [[ -n "$AWS_ROLE_ARN" ]]; then
  args+=("-backend-config=role_arn=${AWS_ROLE_ARN}")
  args+=("-backend-config=session_name=terraform-backend")
else
  args+=("-backend-config=profile=${AWS_PROFILE}")
fi

# apply
export AWS_PROFILE="238287277359-TechOpsAdministrator"
terraform "${1}" \
  -var="role_arn=${AWS_ROLE_ARN}" 
  # -var="stage=$STAGE"
  # "${args[@]}" \
