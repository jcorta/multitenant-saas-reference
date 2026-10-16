#!/bin/sh
# Creates the database roles used by the application.
#   app_owner   - owns the schema; used by migrations and seed only
#   app_runtime - used by the API; NOBYPASSRLS so Row-Level Security always applies
#   app_auth    - BYPASSRLS; owns only the narrow SECURITY DEFINER lookup functions
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE app_owner   LOGIN PASSWORD '${DB_OWNER_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE app_runtime LOGIN PASSWORD '${DB_RUNTIME_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE app_auth    NOLOGIN NOSUPERUSER BYPASSRLS;
GRANT app_auth TO app_owner;
ALTER DATABASE "${POSTGRES_DB}" OWNER TO app_owner;
SQL
