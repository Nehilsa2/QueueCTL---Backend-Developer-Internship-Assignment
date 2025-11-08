import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your SQLite DB (adjust if needed)
const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'queue.sqlite');

// Ensure db folder exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Ensure db exists
if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database file not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
console.log(`🔗 Connected to database: ${dbPath}`);

function columnExists(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some(c => c.name === column);
}

function tableExists(name) {
  const res = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(name);
  return !!res;
}

function addColumnIfMissing(table, column, definition) {
  if (!columnExists(table, column)) {
    console.log(`➕ Adding column ${column} to ${table}`);
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  } else {
    console.log(`✅ Column ${column} already exists in ${table}`);
  }
}
function removeColumn(table, column) {
  if (!columnExists(table, column)) {
    console.log(`❌ Column '${column}' doesn't exist in '${table}'.`);
    return;
  }

  try {
    db.prepare(`ALTER TABLE ${table} DROP COLUMN ${column};`).run();
    console.log(`✅ Column '${column}' removed successfully.`);
  } catch (err) {
    if (err.message.includes('near "DROP"')) {
      console.log(`⚠️ SQLite version may not support DROP COLUMN. Using fallback...`);
      removeColumnFallback(table, column);
    } else {
      console.error(`❌ Error removing column:`, err.message);
    }
  }
}

db.transaction(() => {
  // Ensure jobs table exists
  if (!tableExists('jobs')) {
    console.error('❌ Table "jobs" not found! Make sure to create it first.');
    process.exit(1);
  }

  // Add new columns for bonus features
//   addColumnIfMissing('jobs', 'priority', 'INTEGER DEFAULT 100');
//   addColumnIfMissing('jobs', 'run_at', 'TEXT');
  // addColumnIfMissing('jobs', 'next_run_at', 'TEXT');
//   addColumnIfMissing('jobs', 'stdout', 'TEXT');
//   addColumnIfMissing('jobs', 'stderr', 'TEXT');
//   addColumnIfMissing('jobs', 'started_at', 'TEXT');
//   addColumnIfMissing('jobs', 'finished_at', 'TEXT');
//   addColumnIfMissing('jobs', 'runtime_ms', 'INTEGER DEFAULT 0');
//   addColumnIfMissing('jobs', 'attempt_timestamps', 'TEXT');

  // Ensure metrics table exists

  // removeColumn('jobs','last_error');


  if (!tableExists('metrics')) {
    console.log('📊 Creating table metrics');
    db.prepare(`
      CREATE TABLE metrics (
        key TEXT PRIMARY KEY,
        value INTEGER
      )
    `).run();

    // Insert base metrics
    db.prepare(`
      INSERT INTO metrics (key, value) VALUES
        ('jobs_enqueued', 0),
        ('jobs_completed', 0),
        ('jobs_failed', 0),
        ('jobs_dead', 0)
    `).run();
  } else {
    console.log('✅ Table metrics already exists');
  }
})();


db.prepare(`
  CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    log_output TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )
`).run();

console.log("✅ Schema updated: Added 'job_logs' table.");

console.log('🎉 Database schema update complete!');
db.close();
