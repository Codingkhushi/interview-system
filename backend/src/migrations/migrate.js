/**
 * migrate.js
 * Runs SQL migration files in numeric order.
 * Tracks applied migrations in a schema_migrations table so reruns are safe.
 *
 * Usage:
 *   node src/migrations/migrate.js          — apply all pending
 *   node src/migrations/migrate.js --status — print migration status
 */

const fs   = require('fs');
const path = require('path');
const { getClient } = require('../config/db');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const MIGRATIONS_DIR = __dirname;

// ─── Bootstrap the tracking table ────────────────────────────────────────────
const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.match(/^\d{3}_.*\.sql$/))
    .sort();   // lexicographic = numeric because of leading zeroes
}

async function getApplied(client) {
  const { rows } = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(rows.map(r => r.filename));
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function migrate() {
  const showStatus = process.argv.includes('--status');
  const client = await getClient();

  try {
    // Ensure tracking table exists
    await client.query(BOOTSTRAP_SQL);

    const files   = getMigrationFiles();
    const applied = await getApplied(client);

    if (showStatus) {
      console.log('\nMigration status:');
      console.log('─'.repeat(50));
      for (const f of files) {
        const status = applied.has(f) ? '✓ applied' : '○ pending';
        console.log(`  ${status}  ${f}`);
      }
      console.log('');
      return;
    }

    const pending = files.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('✓ All migrations already applied. Nothing to do.');
      return;
    }

    console.log(`\nApplying ${pending.length} migration(s)...\n`);

    for (const filename of pending) {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql      = fs.readFileSync(filepath, 'utf8');

      console.log(`  → ${filename}`);

      // Each migration runs in its own transaction so a failure
      // doesn't leave the schema half-applied.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`    ✓ done`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`    ✗ FAILED — rolled back`);
        console.error(`      ${err.message}`);
        console.error('\nMigration halted. Fix the error and rerun.\n');
        process.exit(1);
      }
    }

    console.log('\n✓ All migrations applied successfully.\n');

  } finally {
    client.release();
    process.exit(0);
  }
}

migrate().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
