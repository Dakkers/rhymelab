# Committed NON-SECRET config. Secrets (app_password) come from the environment
# (TF_VAR_app_password) or a gitignored *.auto.tfvars — never put them here.
#
# Fill in cf_zone_id and render_owner_id for your accounts (uncomment below); the
# rest are sane defaults you can leave alone.

# cf_zone_id      = "<your-cloudflare-zone-id>"
# render_owner_id = "<your-render-owner-id>"

# api_domain / web_domain are NOT repeated here — their defaults live in
# variables.tf (single source of truth). Override there, or uncomment here only
# if you actually need a different host than the committed default.

render_region = "virginia"
render_plan   = "starter"

neon_region     = "aws-us-east-1"
neon_pg_version = 17

github_repo_url = "https://github.com/Dakkers/rhymelab"
github_branch   = "main"
