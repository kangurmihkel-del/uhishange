import express from 'express';
import path from 'node:path';
import { createApp } from './app.js';
import { pool } from './db.js';

const app = createApp();
if (process.env.TEST_PAYMENTS === 'false')
  throw new Error('This local pilot only supports explicitly simulated TEST payments.');
const directory = path.resolve(process.cwd(), 'dist/client');
app.use(express.static(directory));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(directory, 'index.html'));
});
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Ühishange TEST portal: http://localhost:${port}`);
});
const shutdown = (): void => {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
