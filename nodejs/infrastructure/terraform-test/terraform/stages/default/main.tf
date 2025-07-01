variable "profile" {
  default     = null
  description = "AWS CLI profile to use when invoking Terraform."
  type        = string 
}
variable "region" {
  type    = string
  default = "us-east-2"
}
variable "role_arn" {
  default  = "" 
  nullable = true
  type     = string
}
variable "stage" {
  type    = string
}

# terraform {
#   backend "s3" {
#     bucket         = "tf-state-bucket"            # in your state account
#     key            = "${var.stage}/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "tf-lock-table"
#   }
# }

provider "aws" {
  region  = var.region

  // if you’ve provided a role_arn, drop the profile; otherwise use it
  profile = var.role_arn == "" ? var.profile : null

  // only emit assume_role when var.role_arn is non-empty
  dynamic "assume_role" {
    for_each = var.role_arn != "" ? [var.role_arn] : []
    content {
      role_arn     = assume_role.value
      session_name = "deploy-${terraform.workspace}"
    }
  }
}
