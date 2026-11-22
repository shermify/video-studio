import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, count, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db.js';
import { videoJobs, type NewVideoJob, type VideoJob } from '../schema.js';
import { getAdapter } from '../providers/index.js';
import type {
  CanonicalVideoJob,
  CreateJobResponse,
  ListJobsResponse,
  GetJobResponse,
  DeleteJobResponse,
  RefreshJobResponse,
  RemixJobResponse,
  ExtendJobResponse,
} from '@video-studio/types';

// Zod schemas for validation
const createJobSchema = z.object({
  provider: z.enum(['sora', 'veo']),
  prompt: z.string().min(1),
  mode: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  assets: z
    .array(
      z.object({
        kind: z.enum(['video/mp4', 'video', 'unknown']),
        uri: z.string(),
        bytesBase64: z.string().optional(),
      })
    )
    .optional(),
});

const listJobsQuerySchema = z.object({
  provider: z.enum(['sora', 'veo']).optional(),
  status: z
    .enum(['queued', 'running', 'succeeded', 'failed', 'canceled', 'unknown'])
    .optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const remixJobSchema = z.object({
  prompt: z.string().optional(),
});

const extendJobSchema = z.object({
  prompt: z.string().optional(),
  sourceAssetIndex: z.number().int().min(0).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

// Transform DB row to canonical API shape
function toCanonicalJob(row: VideoJob): CanonicalVideoJob {
  return {
    id: row.id,
    provider: row.provider,
    providerJobId: row.providerJobId,
    status: row.status,
    progressPct: row.progressPct,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    prompt: row.prompt,
    params: row.paramsJson ?? {},
    outputs: row.outputsJson ?? [],
    error: row.errorJson,
    actions: {
      canDownload: row.status === 'succeeded',
      canDelete: true,
      canRemix: row.provider === 'sora' && row.status === 'succeeded',
      canExtend: row.provider === 'veo' && row.status === 'succeeded',
    },
  };
}

export async function jobsRoutes(fastify: FastifyInstance) {
  // POST /jobs - Create a new job
  fastify.post('/jobs', async (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((e) => e.message).join(', '),
        },
      });
    }

    const { provider, prompt, mode, params, assets } = parsed.data;

    const [job] = await db
      .insert(videoJobs)
      .values({
        provider,
        prompt,
        status: 'queued',
        paramsJson: { ...params, mode, assets },
      })
      .returning();

    const response: CreateJobResponse = {
      data: toCanonicalJob(job),
    };

    return reply.status(201).send(response);
  });

  // GET /jobs - List jobs with filters and pagination
  fastify.get('/jobs', async (request, reply) => {
    const parsed = listJobsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((e) => e.message).join(', '),
        },
      });
    }

    const { provider, status, q, limit, cursor } = parsed.data;

    const filters: SQL[] = [];
    if (provider) filters.push(eq(videoJobs.provider, provider));
    if (status) filters.push(eq(videoJobs.status, status));
    if (q) {
      // Treat SQL LIKE wildcards as literal prompt text.
      const escapedQuery = q.replace(/[\\%_]/g, '\\$&');
      filters.push(
        sql`${videoJobs.prompt} like ${`%${escapedQuery}%`} escape ${'\\'}`
      );
    }

    // Count all matching jobs, independently of the current page.
    const [{ total }] = await db
      .select({ total: count() })
      .from(videoJobs)
      .where(and(...filters));

    if (cursor) {
      const cursorJob = await db
        .select({ createdAt: videoJobs.createdAt, id: videoJobs.id })
        .from(videoJobs)
        .where(eq(videoJobs.id, cursor))
        .get();

      // UUIDs do not sort chronologically. Match the full ordering, using the
      // ID to disambiguate jobs created in the same millisecond.
      filters.push(
        cursorJob
          ? or(
              lt(videoJobs.createdAt, cursorJob.createdAt),
              and(
                eq(videoJobs.createdAt, cursorJob.createdAt),
                lt(videoJobs.id, cursorJob.id)
              )
            )!
          : sql`0`
      );
    }

    const jobs = await db
      .select()
      .from(videoJobs)
      .where(and(...filters))
      .orderBy(desc(videoJobs.createdAt), desc(videoJobs.id))
      .limit(limit + 1);

    const hasMore = jobs.length > limit;
    const resultJobs = hasMore ? jobs.slice(0, limit) : jobs;
    const nextCursor = hasMore ? resultJobs[resultJobs.length - 1].id : null;

    const response: ListJobsResponse = {
      data: resultJobs.map(toCanonicalJob),
      meta: {
        total,
        limit,
        nextCursor,
      },
    };

    return reply.send(response);
  });

  // GET /jobs/:id - Get a single job
  fastify.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .get();

    if (!job) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    const response: GetJobResponse = {
      data: toCanonicalJob(job),
    };

    return reply.send(response);
  });

  // DELETE /jobs/:id - Delete a job
  fastify.delete('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .get();

    if (!job) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    await db.delete(videoJobs).where(eq(videoJobs.id, id));

    const response: DeleteJobResponse = {
      data: { id, deleted: true },
    };

    return reply.send(response);
  });

  // POST /jobs/:id/refresh - Refresh job status from provider
  fastify.post('/jobs/:id/refresh', async (request, reply) => {
    const { id } = request.params as { id: string };

    const job = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .get();

    if (!job) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    // Jobs that are already terminal don't need refresh
    if (['succeeded', 'failed', 'canceled'].includes(job.status)) {
      const response: RefreshJobResponse = {
        data: toCanonicalJob(job),
      };
      return reply.send(response);
    }

    const adapter = getAdapter(job.provider);

    // Build the job context for the adapter
    const jobContext = {
      id: job.id,
      providerJobId: job.providerJobId,
      prompt: job.prompt,
      params: job.paramsJson ?? {},
      status: job.status,
      outputs: job.outputsJson ?? [],
    };

    // If job hasn't been submitted yet, submit it first
    if (!job.providerJobId) {
      const submitResult = await adapter.submit(jobContext);

      const [updatedJob] = await db
        .update(videoJobs)
        .set({
          providerJobId: submitResult.providerJobId,
          status: submitResult.status,
          progressPct: submitResult.progressPct,
        })
        .where(eq(videoJobs.id, id))
        .returning();

      const response: RefreshJobResponse = {
        data: toCanonicalJob(updatedJob),
      };
      return reply.send(response);
    }

    // Otherwise refresh the job status
    const refreshResult = await adapter.refresh(jobContext);

    // Build update data, only including changed fields
    const updateData: Partial<NewVideoJob> = {
      status: refreshResult.status,
      progressPct: refreshResult.progressPct,
    };

    if (refreshResult.outputs) {
      updateData.outputsJson = refreshResult.outputs;
    }
    if (refreshResult.error) {
      updateData.errorJson = refreshResult.error;
    }

    const [updatedJob] = await db
      .update(videoJobs)
      .set(updateData)
      .where(eq(videoJobs.id, id))
      .returning();

    const response: RefreshJobResponse = {
      data: toCanonicalJob(updatedJob),
    };
    return reply.send(response);
  });

  // GET /jobs/:id/content - Stream video content from provider
  fastify.get('/jobs/:id/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { asset } = request.query as { asset?: string };
    const assetIndex = asset ? parseInt(asset, 10) : 0;

    const job = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .get();

    if (!job) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    if (job.status !== 'succeeded') {
      return reply.status(400).send({
        error: {
          code: 'JOB_NOT_COMPLETE',
          message: 'Job has not completed successfully',
        },
      });
    }

    const adapter = getAdapter(job.provider);

    const jobContext = {
      id: job.id,
      providerJobId: job.providerJobId,
      prompt: job.prompt,
      params: job.paramsJson ?? {},
      status: job.status,
      outputs: job.outputsJson ?? [],
    };

    const contentResult = await adapter.content(jobContext, assetIndex);

    if (contentResult.type === 'redirect' && contentResult.url) {
      return reply.redirect(contentResult.url);
    }

    if (contentResult.type === 'stream' && contentResult.stream) {
      reply.header('Content-Type', contentResult.contentType || 'video/mp4');
      return reply.send(contentResult.stream);
    }

    return reply.status(500).send({
      error: {
        code: 'CONTENT_ERROR',
        message: 'Unable to retrieve content',
      },
    });
  });

  // POST /jobs/:id/remix - Create a remix of a completed job (Sora only)
  fastify.post('/jobs/:id/remix', async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = remixJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((e) => e.message).join(', '),
        },
      });
    }

    const sourceJob = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .get();

    if (!sourceJob) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    // Only Sora supports remix
    if (sourceJob.provider !== 'sora') {
      return reply.status(400).send({
        error: {
          code: 'UNSUPPORTED_OPERATION',
          message: 'Remix is only supported for Sora jobs',
        },
      });
    }

    if (sourceJob.status !== 'succeeded') {
      return reply.status(400).send({
        error: {
          code: 'JOB_NOT_COMPLETE',
          message: 'Can only remix completed jobs',
        },
      });
    }

    if (!sourceJob.providerJobId) {
      return reply.status(400).send({
        error: {
          code: 'MISSING_PROVIDER_JOB',
          message: 'Source job has no provider job ID',
        },
      });
    }

    const adapter = getAdapter(sourceJob.provider);

    if (!adapter.remix) {
      return reply.status(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Remix not implemented for this provider',
        },
      });
    }

    const sourceJobContext = {
      id: sourceJob.id,
      providerJobId: sourceJob.providerJobId,
      prompt: sourceJob.prompt,
      params: sourceJob.paramsJson ?? {},
      status: sourceJob.status,
      outputs: sourceJob.outputsJson ?? [],
    };

    // Call the provider's remix endpoint
    const remixResult = await adapter.remix(sourceJobContext, {
      prompt: parsed.data.prompt,
    });

    // Create a new job record for the remix
    const [remixJob] = await db
      .insert(videoJobs)
      .values({
        provider: sourceJob.provider,
        providerJobId: remixResult.providerJobId,
        prompt: parsed.data.prompt || sourceJob.prompt,
        status: remixResult.status,
        progressPct: remixResult.progressPct,
        paramsJson: {
          ...sourceJob.paramsJson,
          mode: 'remix',
          sourceJobId: sourceJob.id,
          sourceProviderJobId: sourceJob.providerJobId,
        },
      })
      .returning();

    const response: RemixJobResponse = {
      data: toCanonicalJob(remixJob),
    };

    return reply.status(201).send(response);
  });

  // POST /jobs/:id/extend - Extend a completed video (Veo only)
  fastify.post('/jobs/:id/extend', async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = extendJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((e) => e.message).join(', '),
        },
      });
    }

    const sourceJob = await db
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, id))
      .get();

    if (!sourceJob) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    // Only Veo supports extend
    if (sourceJob.provider !== 'veo') {
      return reply.status(400).send({
        error: {
          code: 'UNSUPPORTED_OPERATION',
          message: 'Extend is only supported for Veo jobs',
        },
      });
    }

    if (sourceJob.status !== 'succeeded') {
      return reply.status(400).send({
        error: {
          code: 'JOB_NOT_COMPLETE',
          message: 'Can only extend completed jobs',
        },
      });
    }

    if (!sourceJob.providerJobId) {
      return reply.status(400).send({
        error: {
          code: 'MISSING_PROVIDER_JOB',
          message: 'Source job has no provider job ID',
        },
      });
    }

    const adapter = getAdapter(sourceJob.provider);

    if (!adapter.extend) {
      return reply.status(501).send({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Extend not implemented for this provider',
        },
      });
    }

    const sourceJobContext = {
      id: sourceJob.id,
      providerJobId: sourceJob.providerJobId,
      prompt: sourceJob.prompt,
      params: sourceJob.paramsJson ?? {},
      status: sourceJob.status,
      outputs: sourceJob.outputsJson ?? [],
    };

    // Call the provider's extend endpoint
    const extendResult = await adapter.extend(sourceJobContext, {
      prompt: parsed.data.prompt,
      sourceAssetIndex: parsed.data.sourceAssetIndex,
      params: parsed.data.params,
    });

    // Create a new job record for the extension
    const [extendJob] = await db
      .insert(videoJobs)
      .values({
        provider: sourceJob.provider,
        providerJobId: extendResult.providerJobId,
        prompt: parsed.data.prompt || sourceJob.prompt,
        status: extendResult.status,
        progressPct: extendResult.progressPct,
        paramsJson: {
          ...sourceJob.paramsJson,
          ...parsed.data.params,
          mode: 'extend',
          sourceJobId: sourceJob.id,
          sourceProviderJobId: sourceJob.providerJobId,
        },
      })
      .returning();

    const response: ExtendJobResponse = {
      data: toCanonicalJob(extendJob),
    };

    return reply.status(201).send(response);
  });
}
