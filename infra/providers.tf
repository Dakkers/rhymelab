# Provider auth comes entirely from the environment — no tokens in git.
#
#   export CLOUDFLARE_API_TOKEN=...   # Zone:Read + DNS:Edit on the zone
#   export RENDER_API_KEY=...         # Render account API key
#   export NEON_API_KEY=...           # Neon account API key
#
# R2 backend credentials (used by `terraform init`) also come from the env:
#   export AWS_ACCESS_KEY_ID=...      # R2 access key id
#   export AWS_SECRET_ACCESS_KEY=...  # R2 secret access key

provider "cloudflare" {}

provider "render" {
  # The account/team that owns the service. Not secret, but account-specific, so
  # it's a required variable rather than a hardcoded default. Find it in the
  # Render dashboard URL (or via the Render API). The API key itself is read from
  # RENDER_API_KEY in the environment.
  owner_id = var.render_owner_id
}

provider "neon" {}

provider "random" {}
