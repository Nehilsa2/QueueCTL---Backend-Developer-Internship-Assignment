import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to database
const db = new Database(path.join(__dirname, '..', 'data', 'queue.sqlite'));

// Get table info
const columns = db.prepare('PRAGMA table_info(jobs)').all();
console.table(columns);
