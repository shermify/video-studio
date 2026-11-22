import { buildApp } from './app.js';
import { db } from './db.js';
import { startJobWorker } from './services/job-lifecycle.js';

const server = buildApp();
let stopWorker: (() => Promise<void>) | undefined;
server.addHook('onClose', async () => {
  await stopWorker?.();
  await db.$client.close();
});

try {
  await server.ready();
  stopWorker = await startJobWorker({
    onError: (error) => server.log.error(error),
  });
  await server.listen({
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '127.0.0.1',
  });
} catch (error) {
  server.log.error(error);
  await server.close();
  process.exitCode = 1;
}

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void server.close().catch((error) => {
      server.log.error(error);
      process.exitCode = 1;
    });
  });
}

export { server };
