const db = require('./db');
const { nowIso, uuidv4 } = require('./utils');

//Enqueue Function
function enqueue(jobJson) {
  const job = typeof jobJson === "string" ? JSON.parse(jobJson) : jobJson;
  const id = job.id || require("uuid").v4();
  const command = job.command;
  const max_retries = job.max_retries || 3;
  const priority = job.priority !== undefined ? job.priority : 100;
  const created_at = new Date().toISOString();
  const updated_at = created_at;

  const stmt = db.prepare(`
    INSERT INTO jobs (
      id, command, state, attempts, max_retries,
      created_at, updated_at, priority
    )
    VALUES (?, ?, 'pending', 0, ?, ?, ?, ?)
  `);

  stmt.run(id, command, max_retries, created_at, updated_at, priority);

  console.log(`✅ Enqueued job ${id} with priority ${priority}`);
  return id;
}

//Get status of jobs 
function getStatusSummary() {
  const rows = db.prepare(`SELECT state, COUNT(*) as cnt FROM jobs GROUP BY state`).all();
  const summary = rows.reduce((acc, r) => { acc[r.state] = r.cnt; return acc; }, {});
  const pending = db.prepare(`SELECT COUNT(*) as c FROM jobs WHERE state='pending' AND (next_run_at IS NULL OR next_run_at <= ?)`).get(nowIso()).c;
  return { by_state: summary, ready_pending: pending };
}


//List all the jobs
function listJobs(state=null) {
  if (state) {
    return db.prepare(`SELECT * FROM jobs WHERE state = ? ORDER BY created_at DESC`).all(state);
  } else {
    return db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`).all();
  }
}

//pick next job for processing
function fetchNextJobForProcessing(workerId) {
  const now = new Date().toISOString();

  const select = db.prepare(`
    SELECT * FROM jobs
    WHERE state = 'pending'
      AND (next_run_at IS NULL OR next_run_at <= ?)
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
  `);

  const job = select.get(now);
  if (!job) return null;

  const update = db.prepare(`
    UPDATE jobs
    SET state = 'processing', worker_id = ?, updated_at = ?
    WHERE id = ? AND state = 'pending'
  `);
  const res = update.run(workerId, now, job.id);
  if (res.changes === 0) return null;

  return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(job.id);
}

//Mark if the job is completed
function markJobCompleted(id) {
  const stmt = db.prepare(`UPDATE jobs SET state='completed', updated_at=? WHERE id = ?`);
  stmt.run(nowIso(), id);
}


//mark if job is failed
function markJobFailed(id, errMsg, attempts, max_retries, backoffSeconds) {
  const now = nowIso();
  if (attempts >= max_retries) {
    // final failure → move to dead (DLQ)
    console.log(`[queue] job ${id} exceeded max retries and moved to DLQ`);
    const stmt = db.prepare(`UPDATE jobs SET state='dead', last_error=?, attempts=?, updated_at=?, worker_id=NULL WHERE id=?`);
    stmt.run(errMsg, attempts, now, id);
  } else {
    // retryable failure — schedule next run
    const nextRun = new Date(Date.now() + backoffSeconds*1000).toISOString();
    console.log(`[queue] job ${id} will retry in ${backoffSeconds}s`);
    const stmt = db.prepare(`UPDATE jobs SET state='failed', last_error=?, attempts=?, next_run_at=?, updated_at=?, worker_id=NULL WHERE id=?`);
    stmt.run(errMsg, attempts, nextRun, now, id);
  }
}

//retry the jobs in DLQ
function moveDlqRetry(id) {
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ? AND state = 'dead'`).get(id);
  if (!job) throw new Error('No dead job found with id '+id);
  const stmt = db.prepare(`UPDATE jobs SET state='pending', attempts=0, last_error=NULL, next_run_at=NULL, updated_at=? WHERE id=?`);
  stmt.run(nowIso(), id);
}

//list all the dead jobs
function listDeadJobs() {
  const stmt = db.prepare(`SELECT * FROM jobs WHERE state='dead'`);
  return stmt.all();
}

//delete jobs
function deleteJob(id) {
  return db.prepare(`DELETE FROM jobs WHERE id = ?`).run(id).changes;
}

//list all jobs
function listAllJobs() {
  const stmt = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC`);
  return stmt.all();
}

//list particular state jobs

function listParticularJobs(state){
  const stmt = db.prepare(`SELECT * FROM jobs where state= ? ORDER BY created_at DESC`);
  return stmt.all(state);
}

//mark job dead
function markJobDead(jobId, error, attempts) {
  const stmt = db.prepare(`
    UPDATE jobs
    SET state = 'dead',
        error = ?,
        attempts = ?
    WHERE id = ?
  `);
  stmt.run(error, attempts, jobId);

  // Optionally insert into DLQ table
  const dlqStmt = db.prepare(`
    INSERT INTO dlq (job_id, error, moved_at)
    VALUES (?, ?, datetime('now'))
  `);
  dlqStmt.run(jobId, error);

  console.log(`[queue] job ${jobId} saved to DLQ`);
}


module.exports = {
  enqueue, getStatusSummary, listJobs, fetchNextJobForProcessing,
  markJobCompleted, markJobFailed, moveDlqRetry, deleteJob,listDeadJobs,listAllJobs,markJobDead,listParticularJobs
};
