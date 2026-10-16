-- Login and token refresh happen before the tenant is known, so they cannot satisfy the RLS
-- policies. Two narrow SECURITY DEFINER functions, owned by a dedicated BYPASSRLS role,
-- are the only way around RLS; each returns at most one row for an exact key.

CREATE FUNCTION auth_find_user_by_email(p_email text)
RETURNS TABLE (id uuid, tenant_id uuid, password_hash text, role user_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.password_hash, u.role FROM users u WHERE u.email = lower(p_email)
$$;

CREATE FUNCTION auth_find_refresh_token(p_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, user_id uuid, family_id uuid, expires_at timestamptz,
               used_at timestamptz, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.tenant_id, r.user_id, r.family_id, r.expires_at, r.used_at, r.revoked_at
  FROM refresh_tokens r WHERE r.token_hash = p_hash
$$;

-- Changing the owner requires CREATE on the schema; grant it only for the duration of this migration.
GRANT CREATE ON SCHEMA public TO app_auth;
ALTER FUNCTION auth_find_user_by_email(text) OWNER TO app_auth;
ALTER FUNCTION auth_find_refresh_token(text) OWNER TO app_auth;
REVOKE CREATE ON SCHEMA public FROM app_auth;

GRANT USAGE ON SCHEMA public TO app_auth;
GRANT SELECT ON users, refresh_tokens TO app_auth;

REVOKE ALL ON FUNCTION auth_find_user_by_email(text), auth_find_refresh_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text), auth_find_refresh_token(text) TO app_runtime;
