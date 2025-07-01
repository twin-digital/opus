provider "aws" {
  region  = var.region

  // if you’ve provided a role_arn, drop the profile; otherwise use it
  profile = var.role_arn == "" ? "238287277359-TechOpsAdministrator" : null

  // only emit assume_role when var.role_arn is non-empty
  dynamic "assume_role" {
    for_each = var.role_arn != "" ? [var.role_arn] : []
    content {
      role_arn     = assume_role.value
      session_name = "deploy-${terraform.workspace}"
    }
  }
  default_tags {
    tags = {
      "pegasus.stack-name" = var.stack_name
    }
  }
}
