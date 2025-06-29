variable "profile" {
  default     = null
  description = "AWS CLI profile to use when invoking Terraform."
  type        = string 
}

variable "region" {
  default     = "us-east-2"
  description = "AWS region to provision organization baseline resources, including the Control Tower landing zone."
  type        = string
}

variable "role_arn" {
  default  = "" 
  nullable = true
  type     = string
}

variable "stack_name" {
  default     = "tfstate-backend"
  description = "Unique name of this deployment stack. Used to create an identifier for Terraform state resources."
  type        = string
}
