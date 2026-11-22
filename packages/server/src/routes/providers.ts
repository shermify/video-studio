import { FastifyInstance } from 'fastify';
import { getAllProviderMetadata } from '../providers/index.js';
import type { ListProvidersResponse } from '@video-studio/types';

export async function providersRoutes(fastify: FastifyInstance) {
  // GET /providers - List available providers with metadata
  fastify.get('/providers', async (_request, reply) => {
    const providers = getAllProviderMetadata();

    const response: ListProvidersResponse = {
      data: providers,
    };

    return reply.send(response);
  });
}
