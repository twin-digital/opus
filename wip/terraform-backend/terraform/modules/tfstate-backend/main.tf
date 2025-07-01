###############################################################################
# S3 Bucket for Terraform State
###############################################################################

resource "aws_s3_bucket" "tf_backend" {
  bucket_prefix = "pegasus-tfstate-"
}

# enable versioning
resource "aws_s3_bucket_versioning" "tf_backend_versioning" {
  bucket = aws_s3_bucket.tf_backend.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access to the bucket
resource "aws_s3_bucket_public_access_block" "tf_backend" {
  bucket = aws_s3_bucket.tf_backend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

###############################################################################
# DynamoDB Table for State Locking
###############################################################################

resource "aws_dynamodb_table" "tf_locks" {
  name         = "${aws_s3_bucket.tf_backend.bucket}-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
