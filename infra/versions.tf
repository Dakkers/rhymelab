# Terraform + provider version pins and remote state.
#
# State holds sensitive values (the Neon connection URI, the generated session
# secret), so it MUST live in a remote backend — never commit *.tfstate. We use
# Cloudflare R2 (S3-compatible) to keep everything on the account you already
# have. The account-specific bits (bucket, R2 endpoint) are supplied at
# `terraform init` time from a local `backend.hcl` (see backend.hcl.example and
# the README), so no account IDs land in git.
#
# For a quick local trial without R2, comment out the whole `backend "s3"` block
# to fall back to local state — but state will then hold secrets in plaintext on
# disk, so don't commit it.

terraform {
  required_version = ">= 1.9"

  backend "s3" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.23"
    }
    render = {
      source  = "render-oss/render"
      version = "~> 1.9"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.15"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
