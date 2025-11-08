import { spawn } from 'child_process';
import { delayMs } from './utils.js';
import * as queue from './queue.js';
import * as config from './config.js';
import db from './db.js'

class Worker {
  constructor(id, shutdownSignal) {
    this.id = id;
    this.running = true;
    this.shutdownSignal = shutdownSignal || (() => false);
    this.currentJob = null;
  }

  async runLoop() {
    while (this.running && !this.shutdownSignal()) {
      try {
        // ⚡ Auto-reactivate missed jobs
        queue.autoActivateMissedJobs();

        const job = queue.fetchNextJobForProcessing(this.id);
        if (!job) {
          if (!this._wasIdle) {
            console.log(`Worker ${this.id} is now idle`);
            this._wasIdle = true;
          }
          await delayMs(1);
          continue;
        }
        // we have a job
        this._wasIdle = false;

        this.currentJob = job;
        await this.executeJob(job);
        this.currentJob = null;
      } catch (e) {
        console.error(`[worker ${this.id}] error loop:`, e);
        await delayMs(1);
      }
    }

  }

  executeJob(job) {
  return new Promise((resolve) => {
    console.log(`[worker ${this.id}] executing job ${job.id}: ${job.command}`);
    job.startTime = Date.now(); // ⏱ Start time for duration
    try { queue.addJobLog(job.id, `started`); } catch (e) {}

    const env = Object.assign({}, process.env, { ATTEMPT: String(job.attempts) });
    const proc = spawn(
      process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      [process.platform === 'win32' ? '/c' : '-c', job.command],
      { stdio: ['pipe', 'pipe', 'pipe'], env }
    );

    if (proc.stdout) {
      proc.stdout.on('data', (chunk) => {
        try { queue.addJobLog(job.id, `[stdout] ${chunk.toString()}`); } catch (e) {}
      });
    }
    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => {
        try { queue.addJobLog(job.id, `[stderr] ${chunk.toString()}`); } catch (e) {}
      });
    }

    const timeoutSeconds = parseInt(config.getConfig('job_timeout', '300'));
    const timeoutHandle = setTimeout(() => {
      console.log(`[worker ${this.id}] job ${job.id} timed out after ${timeoutSeconds}s ⏰`);
      try { queue.addJobLog(job.id, `timed out after ${timeoutSeconds}s`); } catch (e) {}
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid, '/f', '/t']);
      } else {
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch (e) {}
        }, 5000);
      }
    }, timeoutSeconds * 1000);

    proc.on('exit', (code, signal) => {
      clearTimeout(timeoutHandle);
      const attempts = job.attempts + 1;
      const max_retries = job.max_retries;
      const backoffBase = parseFloat(config.getConfig('backoff_base') || '2');

      // calculate duration
      const duration = ((Date.now() - job.startTime) / 1000).toFixed(2);
      const state = code === 0 ? 'completed' : (signal === 'SIGTERM' ? 'timeout' : 'failed');

      // 🧠 record metrics
      try {
        db.prepare(`
          INSERT INTO job_metrics (job_id, command, state, duration)
          VALUES (?, ?, ?, ?)
        `).run(job.id, job.command, state, duration);
        console.log(`[metrics] recorded for job ${job.id} (${state}, ${duration}s)`);
      } catch (err) {
        console.error(`[metrics] failed for job ${job.id}:`, err.message);
      }

      if (code === 0) {
        console.log(`[worker ${this.id}] job ${job.id} completed`);
        try { queue.addJobLog(job.id, `completed (exit=0)`); } catch (e) {}
        queue.markJobCompleted(job.id);
      } else {
        const backoffSeconds = Math.pow(backoffBase, attempts);
        const errMsg = signal === 'SIGTERM' ? 'timeout' : `exit=${code} signal=${signal}`;
        if (signal === 'SIGTERM') {
          console.log(`[worker ${this.id}] job ${job.id} failed due to timeout`);
          try { queue.addJobLog(job.id, `failed: timeout`); } catch (e) {}
        }
        if (attempts > max_retries) {
          console.log(`[worker ${this.id}] job ${job.id} exceeded max retries (${max_retries}). Moved to DLQ ❌`);
          try { queue.addJobLog(job.id, `moved to DLQ after ${attempts} attempts`); } catch (e) {}
        } else {
          console.log(`[worker ${this.id}] job ${job.id} failed (${errMsg}). attempt ${attempts}/${max_retries}. next in ${backoffSeconds}s`);
          try { queue.addJobLog(job.id, `failed: ${errMsg}. attempt ${attempts}/${max_retries}. next in ${backoffSeconds}s`); } catch (e) {}
        }
        queue.markJobFailed(job.id, errMsg, attempts, max_retries, backoffSeconds);
      }
      resolve();
    });

    proc.on('error', (err) => {
      const attempts = job.attempts + 1;
      const max_retries = job.max_retries;
      const backoffBase = parseFloat(config.getConfig('backoff_base') || '2');
      const backoffSeconds = Math.pow(backoffBase, attempts);
      const errMsg = `error=${err.message}`;
      console.log(`[worker ${this.id}] job ${job.id} failed (error). attempt ${attempts}/${max_retries}. next in ${backoffSeconds}s`);
      try { queue.addJobLog(job.id, `error: ${err.message}`); } catch (e) {}
      queue.markJobFailed(job.id, errMsg, attempts, max_retries, backoffSeconds);
      resolve();
    });
  });
}


  async stop() {
    this.running = false;
    // Reset any jobs this worker was processing
    if (this.currentJob) {
      try { queue.addJobLog(this.currentJob.id, 'worker stopping, job reset to pending'); } catch (e) { }
      queue.markJobFailed(this.currentJob.id, 'Worker stopped', this.currentJob.attempts, this.currentJob.max_retries, 0);
    }
  }
}

class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.shutdownRequested = false;
  }

  start(count = 1) {
    // Reset any stuck processing jobs to pending state

    db.prepare(`UPDATE jobs SET state='pending', worker_id=NULL WHERE state='processing'`).run();

    for (let i = 0; i < count; i++) {
      const wid = `worker-${Date.now()}-${Math.floor(Math.random() * 10000)}-${i}`;
      const w = new Worker(wid, () => this.shutdownRequested);
      this.workers.set(wid, w);
      w.runLoop();
      console.log(`[manager] started ${wid}`);
    }
  }

  async stop() {
    console.log(`[manager] graceful shutdown requested`);
    this.shutdownRequested = true;
    // tell each worker to stop accepting new jobs; they'll finish current
    for (const [id, w] of this.workers.entries()) {
      w.stop();
    }
    // wait until all workers have no currentJob
    while (true) {
      let busy = false;
      for (const w of this.workers.values()) {
        if (w.currentJob) busy = true;
      }
      if (!busy) break;
      await delayMs(1);
    }
    console.log('[manager] all workers idle, stopped.');
    this.workers.clear();
  }

  activeCount() { return this.workers.size; }
}

export { WorkerManager };
