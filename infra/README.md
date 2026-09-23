# infra/ — Terraform for the API side

Provisions everything the `@rhymelab/api` backend needs, and the DNS that points
at it:

| Resource | Provider | File |
| --- | --- | --- |
| Managed Postgres | Neon (`kislerdm/neon`) | [database.tf](database.tf) |
| The Fastify service (built from Docker) | Render (`render-oss/render`) | [api.tf](api.tf) |
| `api.<domain>` CNAME → Render | Cloudflare (`cloudflare/cloudflare`) | [dns.tf](dns.tf) |
| Generated session secret | `hashicorp/random` | [secrets.tf](secrets.tf) |

**What Terraform does *not* do:** build or push the API image. Render builds it
from [`app/backend/api/Dockerfile`](../app/backend/api/Dockerfile) on every push
to the configured branch. The **web** Worker is still deployed by Wrangler
(`pnpm deploy`) and is not managed here.

Neon's generated connection string is wired straight into Render as
`DATABASE_URL` — no database password is ever copied by hand.

---

## Prerequisites

- Terraform >= 1.9
- Accounts + API tokens for **Cloudflare**, **Render**, and **Neon**
- A **Cloudflare R2** bucket for remote state (or comment out the backend in
  [versions.tf](versions.tf) to use local state for a throwaway trial)

### Environment (auth — never committed)

```bash
export CLOUDFLARE_API_TOKEN=...   # Zone:Read + DNS:Edit on the zone
export RENDER_API_KEY=...         # Render account API key
export NEON_API_KEY=...           # Neon account API key

# R2 backend credentials (used by `terraform init`)
export AWS_ACCESS_KEY_ID=...      # R2 access key id
export AWS_SECRET_ACCESS_KEY=...  # R2 secret access key

# App secret (injected into the API as APP_PASSWORD)
export TF_VAR_app_password=...
```

### Account-specific values

Uncomment and fill these in [terraform.tfvars](terraform.tfvars):

- `cf_zone_id` — Cloudflare dashboard → the `dakota-stlaurent.com` zone →
  Overview → API box → **Zone ID**
- `render_owner_id` — your Render team/user owner id

---

## One-time setup

1. **Create the R2 state bucket** (once), then configure the backend:

   ```bash
   cp backend.hcl.example backend.hcl
   # edit backend.hcl: set the bucket name + your R2 account id in the endpoint
   ```

2. **Init:**

   ```bash
   terraform init -backend-config=backend.hcl
   ```

---

## Deploy

```bash
terraform plan     # review — expect a Neon project, a Render service, one CNAME
terraform apply
```

Order of operations Terraform handles for you: Neon project → Render service
(with the custom domain attached + `DATABASE_URL` from Neon) → Cloudflare CNAME
pointing at the service's `onrender.com` URL.

After apply:

```bash
terraform output api_url            # https://api.dakota-stlaurent.com
terraform output dns_cname_target   # the onrender.com host the CNAME points at
terraform output -raw neon_connection_uri   # if you need the DB URL locally
```

---

## Gotchas worth knowing

- **TLS cert issuance is async.** The record is created **DNS-only**
  (`proxied = false`) so Render can verify the domain and issue a certificate.
  There's a short window after `apply` where `https://api.<domain>` isn't live
  yet — that's Render provisioning the cert, not a Terraform failure. The
  `onrender.com` URL works immediately. Only after the cert is issued should you
  consider flipping `proxied = true` (and set the zone to SSL/TLS **Full
  (strict)**).

- **Migrations run on deploy, not from Terraform.** `prisma migrate deploy` is
  Render's `pre_deploy_command`, so schema changes apply as part of each
  release. The very first deploy creates all tables in the fresh Neon database.

- **The web build needs `VITE_API_URL`.** The Worker bakes the API URL in at
  build time from `app/frontend/web/.config/.env*`. Set it to
  `https://api.dakota-stlaurent.com` (the chosen constant — not a Terraform
  output, so there's no cross-stack wiring). Rebuild + `pnpm deploy` the Worker
  after the API is live.

- **State has secrets.** The Neon URI and session secret are in state. Keep the
  R2 bucket private; never commit `*.tfstate` or `backend.hcl` (both gitignored).
