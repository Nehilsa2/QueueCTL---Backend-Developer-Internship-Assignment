import * as queue from '../src/queue.js';

(async () => {
  const id = 'test-logs-1';
  try {
    queue.enqueue({ id, command: 'echo log-test-output' });
    queue.addJobLog(id, 'manual: started');
    queue.addJobLog(id, 'manual: finished');
    console.log('✅ Created test job and added logs for', id);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
