resource "aws_s3_bucket_policy" "state_backend" {
  bucket = aws_s3_bucket.tf_backend.bucket

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      // AWS Account Access
      {
        Action    = "s3:ListBucket"
        Condition = {
          ArnLike = {
            "aws:PrincipalArn" = "arn:aws:iam::*:role/AWSReservedSSO_TerraformStateAccess_*"
          }
          StringEquals = {
            "aws:PrincipalOrgID" = data.aws_organizations_organization.current.id
          }
          StringLike = {
            "s3:prefix"        = ["env=$${aws:PrincipalAccount}/*"]
          }
        }
        Effect    = "Allow"
        Principal = "*"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.tf_backend.bucket}"
        Sid       = "AllowListBucketToOwnAccountPrefix"
      },
      {
        Action     = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Condition = {
          ArnLike = {
            "aws:PrincipalArn" = "arn:aws:iam::*:role/AWSReservedSSO_TerraformStateAccess_*"
          }
          StringEquals = {
            "aws:PrincipalOrgID" = data.aws_organizations_organization.current.id
          }
        }
        Effect    = "Allow"
        Principal = "*"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.tf_backend.bucket}/env=$${aws:PrincipalAccount}/*"
        Sid       = "AllowGetPutDeleteToOwnAccountState"
      },
      // Tech Ops Deployer can access on premise
      {
        Action    = "s3:ListBucket"
        Condition = {
          ArnLike = {
            "aws:PrincipalArn" = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/AWSReservedSSO_TerraformStateAccess_*"
          }
          StringLike = {
            "s3:prefix"        = ["env=on-premise/*"]
          }
        }
        Effect    = "Allow"
        Principal = "*"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.tf_backend.bucket}"
        Sid       = "AllowTechOpsListBucketOnPremise"
      },
      {
        Action     = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Condition = {
          ArnLike = {
            "aws:PrincipalArn" = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/AWSReservedSSO_TerraformStateAccess_*"
          }
        }
        Effect    = "Allow"
        Principal = "*"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.tf_backend.bucket}/env=on-premise/*"
        Sid       = "AllowTechOpsGetPutDeleteOnPremise"
      },
      // Tech Ops Admin Access
      {
        Action    = "s3:ListBucket"
        Condition = {
          ArnLike = {
            "aws:PrincipalArn" = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/AWSReservedSSO_TechOpsAdministrator_*"
          }
        }
        Effect    = "Allow"
        Principal = "*"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.tf_backend.bucket}"
        Sid       = "AllowTechOpsAdminToList"
      },
      {
        Action     = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Condition = {
          ArnLike = {
            "aws:PrincipalArn" = "arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/AWSReservedSSO_TechOpsAdministrator_*"
          }
        }
        Effect    = "Allow"
        Principal = "*"
        Resource  = "arn:aws:s3:::${aws_s3_bucket.tf_backend.bucket}/*"
        Sid       = "AllowTechOpsAdminToGetPutDelete"
      }
    ]
  })
}

resource "aws_dynamodb_resource_policy" "lock_table" {
  resource_arn = aws_dynamodb_table.tf_locks.arn
  policy       = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = [
          "dynamodb:DescribeTable",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ]
        Condition = {
          ArnLike      = {
            "aws:PrincipalArn": "arn:aws:iam::*:role/AWSReservedSSO_TerraformStateAccess_*"
          }
          StringEquals = {
            "aws:PrincipalOrgID" = data.aws_organizations_organization.current.id
          }
        }
        Principal = "*"
        Resource  = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.me.account_id}:table/${aws_dynamodb_table.tf_locks.name}"
        Sid       = "AllowTerraformStateAccessRole"
      },
      {
        Effect    = "Allow"
        Action    = [
          "dynamodb:DescribeTable",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ]
        Condition = {
          ArnLike      = {
            "aws:PrincipalArn": "arn:aws:iam::${data.aws_caller_identity.me.account_id}:role/AWSReservedSSO_TechOpsAdministrator_*"
          }
          StringEquals = {
            "aws:PrincipalOrgID" = data.aws_organizations_organization.current.id
          }
        }
        Principal = "*"
        Resource  = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.me.account_id}:table/${aws_dynamodb_table.tf_locks.name}"
        Sid       = "AllowTechOpsAdmin"
      },
    ]
  })
}
