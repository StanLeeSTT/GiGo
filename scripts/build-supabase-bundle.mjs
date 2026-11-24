import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const bundlePath = join(root, "supabase", "GIGO_ONE_FILE_SETUP.sql");
const rangePattern = /^00(?:1[0-9]|2[0-9]|3[0-9]|4[0-8])_.*\.sql$/;

export function buildSupabaseBundle() {
  const current = readFileSync(bundlePath, "utf8");
  const firstMarker = current.indexOf("-- BEGIN CANONICAL MIGRATION 0010_");
  const postflight = current.indexOf("DO $gigo_postflight$");
  if (firstMarker < 0 || postflight < 0 || postflight <= firstMarker) {
    throw new Error("Existing bundle preflight/baseline-repair template could not be located safely.");
  }
  const prefix = current.slice(0, firstMarker);
  const suffix = current.slice(postflight);
  const names = readdirSync(migrationsDir).filter(name => rangePattern.test(name)).sort();
  if (names.length !== 39 || !names[0].startsWith("0010_") || !names.at(-1).startsWith("0048_")) {
    throw new Error("Expected the complete canonical migration range 0010-0048 (39 files).");
  }
  const blocks = names.map(name => {
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    if (!sql.trim()) throw new Error("Canonical migration is empty: " + name);
    return "-- ============================================================================\n"
      + "-- BEGIN CANONICAL MIGRATION " + name + "\n"
      + "-- ============================================================================\n\n"
      + sql + "\n\n"
      + "-- END CANONICAL MIGRATION " + name + "\n"
      + "-- ============================================================================\n";
  });
  return prefix + blocks.join("\n") + "\n" + suffix;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const generated = buildSupabaseBundle();
  if (process.argv.includes("--check")) {
    const current = readFileSync(bundlePath, "utf8");
    if (current !== generated) {
      process.stderr.write("GIGO_ONE_FILE_SETUP.sql is stale. Run npm run db:bundle.\n");
      process.exitCode = 1;
    } else {
      process.stdout.write("Supabase one-file bundle matches canonical migrations 0010-0048.\n");
    }
  } else {
    writeFileSync(bundlePath, generated, "utf8");
    process.stdout.write("Updated supabase/GIGO_ONE_FILE_SETUP.sql from canonical migrations 0010-0048.\n");
  }
}
