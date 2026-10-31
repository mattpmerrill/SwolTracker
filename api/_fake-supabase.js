// A small in-memory stand-in for the Supabase client, for the check-in endpoint tests. It keeps rows
// per table and understands the slice of the query builder the endpoints use (select with filters,
// insert, update, upsert, delete, count, maybeSingle, single, rpc), so tests can assert on what was
// stored and on idempotency across calls. The MCP contract tests use a canned-response double
// (mcp/src/__tests__/mockSupabase.ts); that one cannot hold state, which is what these need.

import { randomUUID } from 'node:crypto';

// Unique keys the real tables enforce (migration 044); an insert that breaks one fails with 23505.
const UNIQUE = {
  chad_checkins: ['user_id', 'target_week'],
  chad_missed_offers: ['user_id', 'week', 'from_day'],
};

const DEFAULTS = {
  chad_checkins: () => ({ recap: {}, changes: [], result: null, reminder_at: null, expires_at: null, notified_at: null, reminded_at: null, decided_at: null }),
  chad_missed_offers: () => ({ expires_at: null, notified_at: null }),
  chad_events: () => ({ metadata: {} }),
};

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function subset(actual, wanted) {
  if (wanted === null || typeof wanted !== 'object') return actual === wanted;
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(wanted).every(([k, v]) => subset(actual[k], v));
}

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.returning = false;
    this.cardinality = 'many';
  }

  select(_columns, options = {}) {
    if (this.op !== 'select') this.returning = true;
    this.count = options.count;
    this.head = options.head;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  upsert(rows, options = {}) { this.op = 'upsert'; this.payload = rows; this.onConflict = options.onConflict; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(column, value) { this.filters.push((r) => r[column] === value); return this; }
  neq(column, value) { this.filters.push((r) => r[column] !== value); return this; }
  in(column, values) { this.filters.push((r) => values.includes(r[column])); return this; }
  is(column, value) { this.filters.push((r) => (r[column] ?? null) === value); return this; }
  gte(column, value) { this.filters.push((r) => r[column] >= value); return this; }
  lte(column, value) { this.filters.push((r) => r[column] <= value); return this; }
  lt(column, value) { this.filters.push((r) => r[column] < value); return this; }
  contains(column, value) { this.filters.push((r) => subset(r[column], value)); return this; }
  order(column, { ascending = true } = {}) { this.sort = { column, ascending }; return this; }
  limit(n) { this.max = n; return this; }
  maybeSingle() { this.cardinality = 'maybe'; return this; }
  single() { this.cardinality = 'one'; return this; }

  then(resolve, reject) {
    return Promise.resolve().then(() => this.run()).then(resolve, reject);
  }

  run() {
    const { db, table } = this;
    const fail = db.failures.get(`${table}.${this.op}`);
    if (fail) return { data: null, error: fail };
    db.log.push({ table, op: this.op, payload: clone(this.payload) });
    const rows = (db.tables[table] ??= []);

    if (this.op === 'insert' || this.op === 'upsert') {
      const inserted = [];
      for (const input of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...DEFAULTS[table]?.(), ...clone(input) };
        if (this.op === 'upsert' && this.onConflict) {
          const key = this.onConflict.split(',');
          const existing = rows.find((r) => key.every((k) => r[k] === row[k]));
          if (existing) { Object.assign(existing, clone(input)); inserted.push(existing); continue; }
        }
        const unique = UNIQUE[table];
        if (unique && rows.some((r) => unique.every((k) => r[k] === row[k]))) {
          return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${table}` } };
        }
        rows.push(row);
        inserted.push(row);
      }
      return this.respond(this.returning ? inserted : null);
    }

    const matched = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === 'update') {
      for (const row of matched) Object.assign(row, clone(this.payload));
      return this.respond(this.returning ? matched : null);
    }
    if (this.op === 'delete') {
      db.tables[table] = rows.filter((r) => !matched.includes(r));
      return this.respond(null);
    }

    let result = matched;
    if (this.sort) {
      const { column, ascending } = this.sort;
      result = [...result].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
    }
    if (this.max !== undefined) result = result.slice(0, this.max);
    if (this.head) return { data: null, count: matched.length, error: null };
    return this.respond(result, matched.length);
  }

  respond(rows, count) {
    const out = rows === null ? null : clone(rows);
    if (this.cardinality === 'maybe') return { data: out?.[0] ?? null, error: null, count };
    if (this.cardinality === 'one') {
      return out?.[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    return { data: out, error: null, count };
  }
}

/**
 * @param {Record<string, object[]>} [seed]  rows per table
 * @param {object} [options]
 * @param {Record<string, (args: any) => any>} [options.rpc]  handlers returning the rpc `data`
 * @param {(token: string) => string | null} [options.auth]  token -> user id (null for a bad token)
 */
export function createFakeSupabase(seed = {}, { rpc = {}, auth = () => null } = {}) {
  const db = { tables: {}, log: [], failures: new Map() };
  for (const [table, rows] of Object.entries(seed)) db.tables[table] = clone(rows);

  const client = {
    from: (table) => new Query(db, table),
    rpc: async (name, args) => {
      db.log.push({ table: 'rpc', op: name, payload: clone(args) });
      const handler = rpc[name];
      return { data: handler ? await handler(args) : null, error: null };
    },
    auth: {
      getUser: async (token) => {
        const id = auth(token);
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } };
      },
    },
  };

  return {
    client,
    rows: (table) => clone(db.tables[table] ?? []),
    writes: (table, op) => db.log.filter((entry) => entry.table === table && (!op || entry.op === op)),
    fail: (key, error = { code: 'XX000', message: 'boom' }) => db.failures.set(key, error),
    clearFailures: () => db.failures.clear(),
  };
}
