# The session-cookie signing secret. Generated here so it never has to be
# invented or stored by hand; it lives only in Terraform state (keep state remote
# + private) and is injected into the API as SESSION_SECRET. The API wants >= 32
# chars; 48 alphanumerics clears that with margin and avoids shell/URL-escaping
# surprises.
resource "random_password" "session_secret" {
  length  = 48
  special = false
}
