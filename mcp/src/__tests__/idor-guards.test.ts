import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readMigration(name: string) {
  return readFileSync(join(root, 'migrations', name), 'utf8');
}

function functionBody(sql: string, fnName: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${fnName}`);
  expect(start, `missing ${fnName}`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end === -1 ? undefined : end);
}

describe('IDOR guards in SQL (slice 2.5)', () => {
  it('accept_group_invite and get_agent_messages call _require_self', () => {
    const sql = readMigration('027-rpc-idor-fixes.sql');
    expect(functionBody(sql, 'accept_group_invite')).toContain('PERFORM _require_self(p_user_id)');
    expect(functionBody(sql, 'get_agent_messages')).toContain('PERFORM _require_self(p_user_id)');
  });

  it('get_error_logs requires is_admin(auth.uid())', () => {
    const sql = readMigration('027-rpc-idor-fixes.sql');
    expect(functionBody(sql, 'get_error_logs')).toMatch(/is_admin\(auth\.uid\(\)\)/);
  });

  it('search_users no longer takes a spoofable current_user_id', () => {
    const sql = readMigration('034-stranger-safe.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION search_users(search_term text)');
    expect(sql).toContain('v_uid := auth.uid()');
    expect(functionBody(sql, 'search_users')).not.toContain('current_user_id');
  });

  it('settings/key RPCs reject non-admin authenticated callers', () => {
    const sql = readMigration('034-stranger-safe.sql');
    for (const name of ['get_app_setting', 'get_global_llm_api_key', 'get_llm_api_key_for_provider']) {
      const body = functionBody(sql, name);
      expect(body).toContain("auth.role() <> 'service_role'");
      expect(body).toContain('is_admin(auth.uid())');
      expect(body).toContain('forbidden');
    }
  });
});
