import { FastifyInstance } from 'fastify';
import { getAllProviderMetadata } from '../providers/index.js';
import type { ListProvidersResponse } from '@video/types';

export async function providersRoutes(fastify: FastifyInstance) {
  // GET /providers - List available providers with metadata
  fastify.get('/providers', async (_request, reply) => {
    const providers = getAllProviderMetadata();

    const response: ListProvidersResponse = {
      data: providers.map((p) => ({
        id: p.id,
        name: p.name,
        modes: p.modes,
        capabilities: p.capabilities,
      })),
    };

    return reply.send(response);
  });
}
