# The Fastify API, built by Render from the repo's root-context Dockerfile
# (app/backend/api/Dockerfile). Render rebuilds + redeploys on every push to the
# configured branch; Terraform owns the service definition, env, and domain — not
# the image build itself.
resource "render_web_service" "api" {
  name   = "rhymelab-api"
  plan   = var.render_plan
  region = var.render_region

  runtime_source = {
    docker = {
      repo_url = var.github_repo_url
      branch   = var.github_branch
      # Build context is the REPO ROOT, not app/backend/api: the API imports the
      # workspace packages @rhymelab/core and @rhymelab/api-contract, which live
      # outside its directory. The Dockerfile installs the pnpm workspace from
      # the root. See app/backend/api/Dockerfile.
      dockerfile_path = "app/backend/api/Dockerfile"
      context         = "."
    }
  }

  # Apply Prisma migrations against Neon before each new version goes live.
  pre_deploy_command = "pnpm --filter @rhymelab/api exec prisma migrate deploy"

  # Attach the custom domain. Render verifies it and issues a cert once the DNS
  # CNAME (dns.tf) resolves to the service — which is why that record starts
  # DNS-only, not proxied.
  custom_domains = [
    { name = var.api_domain },
  ]

  env_vars = {
    NODE_ENV = { value = "production" }

    # Neon's generated connection string flows straight in — no hand-copied DB
    # password anywhere. (Sensitive; lives in state.)
    DATABASE_URL = { value = neon_project.this.connection_uri }

    # Generated in secrets.tf.
    SESSION_SECRET = { value = random_password.session_secret.result }

    # Provided out-of-band (TF_VAR_app_password).
    APP_PASSWORD = { value = var.app_password }

    # CORS runs in credentials mode against this exact origin.
    FRONTEND_ORIGIN = { value = "https://${var.web_domain}" }

    # The Dockerfile already sets HOST=0.0.0.0 so the container binds all
    # interfaces (Render's router/health checks can't reach a 127.0.0.1 bind);
    # set here too so the behavior is visible in the service config.
    HOST = { value = "0.0.0.0" }

    # NOTE: PORT is intentionally NOT set — Render injects its own PORT, and the
    # app already reads process.env.PORT.
  }
}
