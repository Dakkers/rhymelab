output "api_onrender_url" {
  description = "The service's native onrender.com URL (handy before DNS propagates)."
  value       = render_web_service.api.url
}

output "api_url" {
  description = "The public API URL once the custom domain is live."
  value       = "https://${var.api_domain}"
}

output "dns_cname_target" {
  description = "What the api CNAME points at — cross-check in the Cloudflare + Render dashboards."
  value       = trimprefix(render_web_service.api.url, "https://")
}

output "render_service_id" {
  value = render_web_service.api.id
}

output "neon_connection_uri" {
  description = "Direct Postgres connection string (sensitive). Reveal with: terraform output -raw neon_connection_uri"
  value       = neon_project.this.connection_uri
  sensitive   = true
}
