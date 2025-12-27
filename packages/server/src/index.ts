import Fastify, { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { jobsRoutes } from './routes/jobs.js';
import { providersRoutes } from './routes/providers.js';

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',

      options: {
        colorize: true,
      },
    },
  },
});

// Consistent error response shape
interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

server.setErrorHandler(
  (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;
    const response: ErrorResponse = {
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : error.message,
      },
    };

    server.log.error(error);
    reply.status(statusCode).send(response);
  }
);

server.register(FastifySSEPlugin);

// 404 handler with consistent error shape
server.setNotFoundHandler((_request, reply) => {
  reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

// Root health check
server.get('/healthz', async () => {
  return { ok: true };
});

// Versioned API routes
server.register(
  async (api) => {
    api.get('/healthz', async () => {
      return { ok: true };
    });

    // Register jobs CRUD routes
    api.register(jobsRoutes);

    // Register providers routes
    api.register(providersRoutes);
  },
  { prefix: '/api/' }
);

try {
  await server.listen({ port: 3000 });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
export { server };
