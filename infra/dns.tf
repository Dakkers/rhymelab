# api.dakota-stlaurent.com → the Render service.
#
# Starts DNS-only (proxied = false) so Render can see the CNAME resolve to
# *.onrender.com and issue the TLS certificate for the custom domain. Once the
# cert is issued you can optionally flip proxied = true to put the record behind
# Cloudflare — set the zone's SSL/TLS mode to Full (strict) if you do.
resource "cloudflare_dns_record" "api" {
  zone_id = var.cf_zone_id
  name    = var.api_domain
  type    = "CNAME"
  # Render exposes the service origin as `url` (https://<slug>.onrender.com);
  # strip the scheme for the CNAME target.
  content = trimprefix(render_web_service.api.url, "https://")
  proxied = false
  ttl     = 1 # 1 = automatic; must be an explicit value on an un-proxied record
}
