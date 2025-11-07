const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Path to your SQLite DB (adjust if needed)
const dbDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dbDir, "queue.sqlite");

//ensure db folder exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ensure db exists
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

db.transaction(() => {
  // Ensure jobs table exists
  if (!tableExists('jobs')) {
    console.error('❌ Table "jobs" not found! Make sure to create it first.');
    process.exit(1);
  }

  // Add new columns for bonus features
//   addColumnIfMissing('jobs', 'priority', 'INTEGER DEFAULT 100');
//   addColumnIfMissing('jobs', 'run_at', 'TEXT');
  addColumnIfMissing('jobs', 'next_run_at', 'TEXT');
//   addColumnIfMissing('jobs', 'stdout', 'TEXT');
//   addColumnIfMissing('jobs', 'stderr', 'TEXT');
//   addColumnIfMissing('jobs', 'started_at', 'TEXT');
//   addColumnIfMissing('jobs', 'finished_at', 'TEXT');
//   addColumnIfMissing('jobs', 'runtime_ms', 'INTEGER DEFAULT 0');
//   addColumnIfMissing('jobs', 'attempt_timestamps', 'TEXT');

  // Ensure metrics table exists
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

console.log('🎉 Database schema update complete!');
db.close();
