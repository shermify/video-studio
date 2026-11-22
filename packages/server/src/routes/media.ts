import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { getMediaFile, MediaError, saveUpload, sendMediaFile } from '../media/storage.js';

export async function mediaRoutes(app: FastifyInstance) {
  app.register(multipart, { limits: { fileSize: 50_000_000, files: 1, fields: 0, parts: 1 } });

  app.post('/media', async (request, reply) => {
    const file = await request.file();
    if (!file) throw new MediaError('Choose a media file to upload.');
    return reply.code(201).send({ data: await saveUpload(file) });
  });

  app.get<{ Params: { id: string } }>('/media/:id', async (request, reply) => {
    const { asset, path } = await getMediaFile(request.params.id);
    return sendMediaFile(request, reply, path, asset.mimeType, asset.name);
  });
}
