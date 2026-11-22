import Fastify from 'fastify';
import { jobsRoutes } from './routes/jobs.js';
import { providersRoutes } from './routes/providers.js';
import { mediaRoutes } from './routes/media.js';

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    reply.status(statusCode).send({
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode === 500 ? 'Internal server error' : error.message,
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.register(async (api) => {
    api.get('/healthz', async () => ({ ok: true }));
    api.register(jobsRoutes);
    api.register(providersRoutes);
    api.register(mediaRoutes);
  }, { prefix: '/api' });
  return app;
}
