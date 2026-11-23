import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/0037_durable_autonomy_governance.sql", import.meta.url), "utf8");

test("durable autonomy tables are owner-scoped and protected by RLS", () => {
  for (const table of ["autonomy_control_state","autonomy_policies","autonomy_approvals","autonomy_audit_events"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /user_id uuid not null references auth\.users\(id\)/);
});

test("financial execution is absent from configurable scopes and approvals", () => {
  assert.match(migration, /scope in \('observe','analyse','draft','internal_execute','external_execute'\)/);
  assert.doesNotMatch(migration, /scope in \([^)]*financial/);
  assert.match(migration, /financial actions cannot be approved for GiGo execution/);
  assert.match(migration, /autonomy_external_always_approved/);
});

test("authenticated clients cannot forge policy, pause, approval or audit records", () => {
  assert.match(migration, /revoke all on public\.autonomy_control_state, public\.autonomy_policies,[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.gigo_set_autonomy_policy[\s\S]*auth\.uid\(\)/);
  assert.match(migration, /create or replace function public\.gigo_set_autonomy_pause[\s\S]*auth\.uid\(\)/);
  assert.match(migration, /create or replace function public\.gigo_create_autonomy_approval[\s\S]*auth\.uid\(\)/);
  assert.match(migration, /create or replace function public\.gigo_revoke_autonomy_approval[\s\S]*auth\.uid\(\)/);
});

test("approvals are exact-target, parameter-bound, expiring, quota-limited and revocable", () => {
  assert.match(migration, /parameters_sha256 text not null check \(parameters_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /max_actions integer not null default 1 check \(max_actions between 1 and 1000\)/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /revoked_at timestamptz/);
  assert.match(migration, /used_actions between 0 and max_actions/);
});

test("audit events are owner-scoped and idempotency keys are unique per owner", () => {
  assert.match(migration, /autonomy_audit_owner_idempotency/);
  assert.match(migration, /unique index if not exists autonomy_audit_owner_idempotency[\s\S]*user_id, idempotency_key/);
  assert.match(migration, /grant select, insert on public\.autonomy_audit_events to service_role/);
});

test("no global default-unpaused state is created; missing control row remains fail-closed by design", () => {
  assert.match(migration, /is_paused boolean not null default true/);
  assert.doesNotMatch(migration, /insert into public\.autonomy_control_state/);
});
