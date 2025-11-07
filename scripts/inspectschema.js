const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'queue.sqlite'));

const columns = db.prepare('PRAGMA table_info(jobs)').all();
console.table(columns);
