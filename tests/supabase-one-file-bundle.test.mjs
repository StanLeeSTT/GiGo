import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const bundlePath = join(root, 'supabase', 'GIGO_ONE_FILE_SETUP.sql');

test('one-file Supabase bundle contains canonical migrations 0010-0047 exactly once and in order', () => {
  const bundle = readFileSync(bundlePath, 'utf8');
  const expectedFiles = readdirSync(migrationsDir)
    .filter((name) => /^00(?:1[0-9]|2[0-9]|3[0-9]|4[0-7])_.*\.sql$/.test(name))
    .sort();
  const marker = /-- BEGIN CANONICAL MIGRATION ([^\r\n]+)\r?\n-- =+\r?\n\r?\n([\s\S]*?)\r?\n\r?\n-- END CANONICAL MIGRATION \1/g;
  const embedded = [...bundle.matchAll(marker)];

  assert.equal(expectedFiles.length, 38, 'expected canonical migration range 0010-0047');
  assert.deepEqual(embedded.map((match) => match[1]), expectedFiles);
  for (const match of embedded) {
    const canonical = readFileSync(join(migrationsDir, match[1]), 'utf8');
    assert.equal(match[2], canonical, `bundle content differs from ${match[1]}`);
  }

  assert.match(bundle, /BEGIN;\s*DO \$gigo_preflight\$/);
  assert.match(bundle, /DO \$gigo_postflight\$/);
  assert.match(bundle, /COMMIT;\s*$/);
  assert.match(bundle, /not safe to re-run/i);
  assert.doesNotMatch(bundle, /CREATE EXTENSION/i);
});

test('bundle safely includes the idempotent 0002/0003 baseline repairs', () => {
  const bundle = readFileSync(bundlePath, 'utf8');
  assert.match(bundle, /BASELINE REPAIR: 0002_task_project_ownership\.sql/);
  assert.match(bundle, /BASELINE REPAIR: 0003_assistant_conversation_activity\.sql/);
  assert.match(bundle, /create or replace function public\.check_task_project_owner/);
  assert.match(bundle, /create or replace function public\.touch_conversation_on_message/);
});

test('canonical migration files remain the source of truth', () => {
  const bundle = readFileSync(bundlePath, 'utf8');
  assert.match(bundle, /Do NOT delete them/i);
  assert.ok(readdirSync(migrationsDir).includes('0046_decodo_web_data_api.sql') && readdirSync(migrationsDir).includes('0047_whop_read_only_sales_events.sql'));
});
