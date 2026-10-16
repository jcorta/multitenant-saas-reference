-- Row-Level Security is the last line of defense. The policy compares tenant_id with a
-- transaction-local setting; nullif() turns the empty string PostgreSQL returns for a
-- previously defined but reset setting into NULL, so an unset tenant matches no rows (fail-closed).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'products', 'orders', 'order_items', 'refresh_tokens'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- FORCE applies the policies to the table owner as well.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END $$;

-- Runtime role: DML only, no DDL, no ownership.
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT ON tenants TO app_runtime;
GRANT SELECT ON users TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON products, orders, order_items TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO app_runtime;
