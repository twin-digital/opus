variable "region" {
  type    = string
  default = "us-east-2"
}
variable "stage" {
  type    = string
  default = terraform.workspace
}

terraform {
  backend "s3" {
    bucket         = "tf-state-bucket"            # in your state account
    key            = "${var.stage}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "tf-lock-table"
  }
}

locals {
  account_ids = {
    dev     = "111111111111"
    staging = "222222222222"
    prod    = "333333333333"
    # you can even default to the current user name for ad-hoc stages,
    # and have a map entry for each developer if you’d like isolation per user
  }
  target_account = lookup(local.account_ids, var.stage, "") 
}



provider "aws" {
  alias  = "deploy"
  region = var.region
  assume_role {
    role_arn = "arn:aws:iam::${local.target_account}:role/terraform-role"
  }
}
