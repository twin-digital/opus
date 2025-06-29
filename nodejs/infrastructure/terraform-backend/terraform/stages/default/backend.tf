terraform {
  backend "s3" {
    bucket  = "pegasus-tfstate-20250510190118592600000001"
    key     = "env=238287277359/stack=tfstate-backend/terraform.tfstate"
    region  = "us-east-2"
    dynamodb_table = "pegasus-tfstate-20250510190118592600000001-locks"
  }
}
