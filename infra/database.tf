# Managed Postgres. Creating the project also creates a default branch, database,
# and role; `connection_uri` is the ready-to-use direct connection string for
# that default database (credentials embedded). We use the DIRECT uri (not
# `connection_uri_pooler`) because Prisma Migrate needs a non-pooled connection,
# and the Fastify server keeps its own long-lived pool via the pg driver adapter.
resource "neon_project" "this" {
  name       = "rhymelab"
  region_id  = var.neon_region
  pg_version = var.neon_pg_version
}
