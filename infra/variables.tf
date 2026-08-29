# ─── Cloudflare ──────────────────────────────────────────────────────────────

variable "cf_zone_id" {
  type        = string
  description = <<-EOT
    Zone ID for the domain that hosts the API subdomain. Found in the Cloudflare
    dashboard (the zone's Overview → API box → Zone ID) for `dakota-stlaurent.com`.
    We take the ID directly rather than looking it up by name to stay independent
    of the zone data-source schema.
  EOT
}

variable "api_domain" {
  type        = string
  description = "Fully-qualified hostname the API is served at."
  default     = "api.dakota-stlaurent.com"
}

variable "web_domain" {
  type        = string
  description = "The web app's hostname. Used to build FRONTEND_ORIGIN for the API's CORS allowlist."
  default     = "rhymelab.dakota-stlaurent.com"
}

# ─── Render (compute) ────────────────────────────────────────────────────────

variable "render_owner_id" {
  type        = string
  description = "Render account/team owner ID that owns the web service."
}

variable "render_region" {
  type        = string
  description = "Render region. Keep it co-located with the Neon region. virginia = AWS us-east-1."
  default     = "virginia"
}

variable "render_plan" {
  type        = string
  description = "Render instance plan. `starter` is the smallest always-on paid plan."
  default     = "starter"
}

variable "github_repo_url" {
  type        = string
  description = "Repo Render builds the API image from."
  default     = "https://github.com/Dakkers/rhymelab"
}

variable "github_branch" {
  type        = string
  description = "Branch Render auto-deploys."
  default     = "main"
}

# ─── Neon (Postgres) ─────────────────────────────────────────────────────────

variable "neon_region" {
  type        = string
  description = "Neon region id. aws-us-east-1 = N. Virginia (pairs with Render `virginia`)."
  default     = "aws-us-east-1"
}

variable "neon_pg_version" {
  type        = number
  description = "Postgres major version. Matches the local compose.yaml (17)."
  default     = 17
}

# ─── App secrets ─────────────────────────────────────────────────────────────

variable "app_password" {
  type        = string
  sensitive   = true
  description = <<-EOT
    The single shared password that unlocks the app (the API's APP_PASSWORD).
    Provide via `export TF_VAR_app_password=...` or a gitignored *.auto.tfvars —
    never commit it. The session secret is generated automatically (secrets.tf)
    and needs no variable.
  EOT
}
