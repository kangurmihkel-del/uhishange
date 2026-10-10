import { processJobs } from './domain.js';
import { pool } from './db.js';

if (process.env.TEST_PAYMENTS === 'false')
  throw new Error('This local pilot only supports explicitly simulated TEST payments.');

let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
while (!stopped) {
  try {
    await processJobs();
  } catch (error) {
    console.error('Worker cycle failed', error);
  }
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, 1000));
}
await pool.end();
