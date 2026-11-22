import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.js';
import { videoJobs, type VideoJob } from '../schema.js';
import { getAdapter } from '../providers/index.js';
import { sendStoredOutput } from '../media/storage.js';
import {
  JobError, cancelJob, deleteJob, findRequestedJob, getJob, jobContext, queueJob, refreshJob, snapshotJobContext, withJobLock,
} from '../services/job-lifecycle.js';
import type { CanonicalVideoJob, ListJobsResponse } from '@video-studio/types';

const requestId = z.uuid().optional();
const inputSchema = z.object({
  kind: z.enum(['image', 'video', 'audio']),
  role: z.enum(['first_frame', 'last_frame', 'reference_image', 'reference_video', 'reference_audio']),
  uri: z.url().refine((value) => new URL(value).protocol === 'https:', 'Media URLs must use HTTPS').optional(),
  assetId: z.uuid().optional(),
}).refine((input) => Boolean(input.uri) !== Boolean(input.assetId), 'Provide a media URL or an uploaded asset ID, but not both');
const createJobSchema = z.object({
  provider: z.enum(['sora', 'veo', 'minimax']),
  prompt: z.string().min(1).refine((value) => value.trim().length > 0, 'Prompt must not be blank'),
  mode: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  requestId,
  inputs: z.array(inputSchema).optional(),
  assets: z.array(z.object({
    kind: z.enum(['video/mp4', 'video', 'unknown']),
    uri: z.string(), bytesBase64: z.string().optional(),
  })).optional(),
});
const listJobsQuerySchema = z.object({
  provider: z.enum(['sora', 'veo', 'minimax']).optional(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled', 'unknown']).optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
const remixJobSchema = z.object({ prompt: z.string().optional(), requestId });
const extendJobSchema = remixJobSchema.extend({
  sourceAssetIndex: z.number().int().min(0).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});
const regenerateJobSchema = z.object({
  requestId,
  sourceAssetIndex: z.number().int().min(0).optional(),
  generateAudio: z.boolean().optional(),
});

export function toCanonicalJob(row: VideoJob): CanonicalVideoJob {
  const adapter = getAdapter(row.provider);
  const safePending = row.status === 'queued' && row.submissionState === 'pending' && !row.providerJobId;
  const terminal = ['succeeded', 'failed', 'canceled'].includes(row.status);
  return {
    id: row.id, provider: row.provider, providerJobId: row.providerJobId,
    status: row.status, progressPct: row.progressPct,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    prompt: row.prompt, params: row.paramsJson ?? {}, inputs: row.inputsJson ?? [],
    outputs: row.outputsJson ?? [], error: row.errorJson,
    metadata: { ...row.metadataJson, submissionState: row.submissionState, archiveState: row.archiveState },
    actions: {
      canDownload: row.status === 'succeeded' && Boolean(row.outputsJson?.length),
      canDelete: safePending || (terminal && !['submitting', 'uncertain'].includes(row.submissionState)),
      canRemix: row.provider === 'sora' && row.status === 'succeeded',
      canExtend: row.provider === 'veo' && row.status === 'succeeded',
      canCancel: safePending || (row.status === 'queued' && Boolean(row.providerJobId) && Boolean(adapter.cancel)),
      canRegenerate: row.provider === 'minimax' && row.status === 'succeeded' &&
        (row.metadataJson?.resolution ?? row.paramsJson?.resolution) === '768P' &&
        row.paramsJson?.generateAudio !== false && row.paramsJson?.generate_audio !== false && Boolean(adapter.regenerate),
    },
  };
}

export async function jobsRoutes(fastify: FastifyInstance) {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: {
        code: 'VALIDATION_ERROR', message: error.issues.map((issue) => issue.message).join(', '),
      } });
    }
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED';
      return reply.status(error.statusCode).send({ error: { code, message: error.message } });
    }
    fastify.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  fastify.post('/jobs', async (request, reply) => {
    const parsed = createJobSchema.parse(request.body);
    if (['remix', 'extend', 'regenerate'].includes(parsed.mode ?? '')) {
      throw new JobError(400, 'INVALID_MODE', 'Use the source video action to create this operation.');
    }
    const { provider, prompt, mode, params, assets, inputs } = parsed;
    const job = await queueJob({
      provider, prompt, paramsJson: { ...params, mode, assets }, inputsJson: inputs,
    }, { requestId: parsed.requestId, payload: { operation: 'create', ...parsed } });
    return reply.status(201).send({ data: toCanonicalJob(job) });
  });

  fastify.get('/jobs', async (request, reply) => {
    const { provider, status, q, limit, cursor } = listJobsQuerySchema.parse(request.query);
    const filters: SQL[] = [];
    if (provider) filters.push(eq(videoJobs.provider, provider));
    if (status) filters.push(eq(videoJobs.status, status));
    if (q) {
      const escaped = q.replace(/[\\%_]/g, '\\$&');
      filters.push(sql`${videoJobs.prompt} like ${`%${escaped}%`} escape ${'\\'}`);
    }
    const [{ total }] = await db.select({ total: count() }).from(videoJobs).where(and(...filters));
    if (cursor) {
      const row = await db.select({ createdAt: videoJobs.createdAt, id: videoJobs.id })
        .from(videoJobs).where(eq(videoJobs.id, cursor)).get();
      filters.push(row ? or(
        lt(videoJobs.createdAt, row.createdAt),
        and(eq(videoJobs.createdAt, row.createdAt), lt(videoJobs.id, row.id))
      )! : sql`0`);
    }
    const rows = await db.select().from(videoJobs).where(and(...filters))
      .orderBy(desc(videoJobs.createdAt), desc(videoJobs.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const jobs = rows.slice(0, limit);
    const response: ListJobsResponse = {
      data: jobs.map(toCanonicalJob),
      meta: { total, limit, nextCursor: hasMore ? jobs[jobs.length - 1].id : null },
    };
    return reply.send(response);
  });

  fastify.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ data: toCanonicalJob(await getJob(id)) });
  });
  fastify.delete('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await deleteJob(id);
    return reply.send({ data: { id, deleted: true } });
  });
  fastify.post('/jobs/:id/refresh', async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ data: toCanonicalJob(await refreshJob(id)) });
  });
  fastify.post('/jobs/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send({ data: toCanonicalJob(await cancelJob(id)) });
  });

  fastify.get('/jobs/:id/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { asset: index } = z.object({ asset: z.coerce.number().int().min(0).default(0) }).parse(request.query);
    const job = await getJob(id);
    if (job.status !== 'succeeded') throw new JobError(400, 'JOB_NOT_COMPLETE', 'Job has not completed successfully');
    const asset = job.outputsJson?.[index];
    if (!asset) throw new JobError(404, 'ASSET_NOT_FOUND', 'Video output not found');
    if (asset.storageKey) return sendStoredOutput(request, reply, asset.storageKey);
    const result = await getAdapter(job.provider).content(jobContext(job), index);
    if (result.type === 'redirect' && result.url) return reply.redirect(result.url);
    if (result.type === 'stream' && result.stream) {
      return reply.header('Content-Type', result.contentType ?? 'video/mp4').send(result.stream);
    }
    throw new JobError(502, 'CONTENT_ERROR', 'Unable to retrieve video content');
  });

  for (const operation of ['remix', 'extend', 'regenerate'] as const) {
    fastify.post(`/jobs/:id/${operation}`, async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = operation === 'remix' ? remixJobSchema.parse(request.body ?? {})
        : operation === 'extend' ? extendJobSchema.parse(request.body ?? {})
          : regenerateJobSchema.parse(request.body ?? {});
      const idempotency = { requestId: parsed.requestId, payload: { operation, sourceJobId: id, ...parsed } };
      const previous = await findRequestedJob(idempotency);
      if (previous) return reply.status(201).send({ data: toCanonicalJob(previous) });
      return withJobLock(id, async () => {
      const source = await getJob(id);
      const adapter = getAdapter(source.provider);
      if ((operation === 'remix' && (source.provider !== 'sora' || !adapter.remix)) ||
        (operation === 'extend' && (source.provider !== 'veo' || !adapter.extend)) ||
        (operation === 'regenerate' && (source.provider !== 'minimax' || !adapter.regenerate))) {
        throw new JobError(400, 'UNSUPPORTED_OPERATION', `This provider does not support ${operation}.`);
      }
      if (source.status !== 'succeeded') throw new JobError(400, 'JOB_NOT_COMPLETE', 'The source video must have completed successfully.');
      if (!source.providerJobId) throw new JobError(400, 'MISSING_PROVIDER_JOB', 'The source video has no provider task ID.');
      const body = parsed as z.infer<typeof extendJobSchema> & z.infer<typeof regenerateJobSchema>;
      const assetIndex = body.sourceAssetIndex ?? 0;
      if (operation !== 'remix' && !source.outputsJson?.[assetIndex]) {
        throw new JobError(400, 'ASSET_NOT_FOUND', 'The selected source video output does not exist.');
      }
      if (operation === 'regenerate') {
        await adapter.validateRegeneration?.(jobContext(source), {
          sourceAssetIndex: assetIndex, generateAudio: body.generateAudio,
        });
      }
      const { promptExpansionMode: _expansion, extra: _extra, ...regenerationParams } = source.paramsJson ?? {};
      const job = await queueJob({
        provider: source.provider,
        prompt: operation === 'regenerate' ? source.prompt : body.prompt || source.prompt,
        inputsJson: source.inputsJson,
        paramsJson: {
          ...(operation === 'regenerate' ? regenerationParams : source.paramsJson),
          ...(operation === 'extend' ? body.params : {}),
          mode: operation, sourceJobId: id, sourceProviderJobId: source.providerJobId,
          sourceJobSnapshot: snapshotJobContext(source),
          sourceAssetIndex: assetIndex,
          ...(operation === 'regenerate' ? {
            model: 'MiniMax-H3', resolution: '2K',
            generateAudio: body.generateAudio ?? source.paramsJson?.generateAudio ?? source.paramsJson?.generate_audio ?? true,
          } : {}),
        },
      }, idempotency, false);
      return reply.status(201).send({ data: toCanonicalJob(job) });
      });
    });
  }
}
