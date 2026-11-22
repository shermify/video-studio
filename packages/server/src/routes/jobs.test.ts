import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/tursodatabase/database';
import { migrate } from 'drizzle-orm/tursodatabase/migrator';
import type {
  CanonicalVideoAsset,
  CanonicalVideoJob,
  CreateJobRequest,
  ListJobsResponse,
} from '@video-studio/types';

const directory = await mkdtemp(join(tmpdir(), 'video-studio-db-'));
const databaseFile = join(directory, 'jobs.db');
const previousDatabaseFile = process.env.DB_FILE_NAME;
const previousUseStubs = process.env.USE_STUB_ADAPTERS;
process.env.DB_FILE_NAME = databaseFile;
process.env.USE_STUB_ADAPTERS = 'true';

// Import after configuring the isolated database and stub-only providers.
const { db } = await import('../db.js');
const { videoJobs } = await import('../schema.js');
const { jobsRoutes } = await import('./jobs.js');
const { getAdapter, SoraAdapterStub, VeoAdapterStub } = await import('../providers/index.js');
const app = Fastify();
const migrationConfig = {
  migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
};

before(async () => {
  await migrate(db, migrationConfig);
  // A repeated migration must leave an existing database usable.
  await migrate(db, migrationConfig);
  app.register(jobsRoutes, { prefix: '/api' });
  await app.ready();
});

beforeEach(async () => {
  mock.restoreAll();
  await db.delete(videoJobs);
});

after(async () => {
  mock.restoreAll();
  await app.close();
  await db.$client.close();
  await rm(directory, { recursive: true, force: true });
  if (previousDatabaseFile === undefined) delete process.env.DB_FILE_NAME;
  else process.env.DB_FILE_NAME = previousDatabaseFile;
  if (previousUseStubs === undefined) delete process.env.USE_STUB_ADAPTERS;
  else process.env.USE_STUB_ADAPTERS = previousUseStubs;
});

async function createJob(payload: CreateJobRequest): Promise<CanonicalVideoJob> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/jobs',
    payload,
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ data: CanonicalVideoJob }>().data;
}

async function refreshJob(id: string): Promise<CanonicalVideoJob> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/jobs/${id}/refresh`,
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<{ data: CanonicalVideoJob }>().data;
}

test('stores job defaults, JSON and dates in a durable local database', async () => {
  const params = { seed: 42, nested: { enabled: true }, choices: ['a', 'b'] };
  const assets: CanonicalVideoAsset[] = [
    { kind: 'video/mp4', uri: 'https://example.com/input.mp4' },
  ];
  const job = await createJob({
    provider: 'sora',
    prompt: 'A quiet lake',
    mode: 'generate',
    params,
    assets,
  });

  assert.match(job.id, /^[0-9a-f-]{36}$/);
  assert.equal(job.status, 'queued');
  assert.equal(job.providerJobId, null);
  assert.equal(job.progressPct, null);
  assert.deepEqual(job.outputs, []);
  assert.equal(job.error, null);
  assert.equal(new Date(job.createdAt).toISOString(), job.createdAt);
  assert.equal(new Date(job.updatedAt).toISOString(), job.updatedAt);
  assert.deepEqual(job.params, { ...params, mode: 'generate', assets });

  // Read through a separately opened connection to prove file persistence.
  const reopened = drizzle(databaseFile);
  try {
    const stored = await reopened
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.id, job.id))
      .get();
    assert.ok(stored);
    assert.deepEqual(stored.paramsJson, job.params);
    assert.equal(stored.createdAt.toISOString(), job.createdAt);
  } finally {
    await reopened.$client.close();
  }

  const retrieved = await app.inject(`/api/jobs/${job.id}`);
  assert.equal(retrieved.statusCode, 200);
  assert.deepEqual(retrieved.json().data, job);
  const deleted = await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json().data, { id: job.id, deleted: true });
  assert.equal((await app.inject(`/api/jobs/${job.id}`)).statusCode, 404);
});

test('filters and paginates by creation time with stable ID ordering', async () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  await db.insert(videoJobs).values([
    { id: 'a', provider: 'sora', prompt: 'Blue SKY', createdAt },
    { id: 'z', provider: 'sora', prompt: 'Blue sky', createdAt },
    {
      id: 'm',
      provider: 'sora',
      prompt: 'Blue sky',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    { id: 'other-provider', provider: 'veo', prompt: 'Blue sky', createdAt },
    { id: 'other-status', provider: 'sora', status: 'failed', prompt: 'Blue sky', createdAt },
    { id: 'literal', provider: 'sora', prompt: '100%_\\ completed', createdAt },
    { id: 'wildcard', provider: 'sora', prompt: '100XXX completed', createdAt },
  ]);

  const base = '/api/jobs?provider=sora&status=queued&q=SKY&limit=2';
  const firstResponse = await app.inject(base);
  assert.equal(firstResponse.statusCode, 200, firstResponse.body);
  const first = firstResponse.json<ListJobsResponse>();
  assert.deepEqual(first.data.map((job) => job.id), ['m', 'z']);
  assert.deepEqual(first.meta, { total: 3, limit: 2, nextCursor: 'z' });

  const second = (await app.inject(`${base}&cursor=z`)).json<ListJobsResponse>();
  assert.deepEqual(second.data.map((job) => job.id), ['a']);
  assert.deepEqual(second.meta, { total: 3, limit: 2, nextCursor: null });
  const missingCursor = (await app.inject(`${base}&cursor=missing`)).json<ListJobsResponse>();
  assert.deepEqual(missingCursor.data, []);
  assert.equal(missingCursor.meta.total, 3);

  const literalResponse = await app.inject(`/api/jobs?q=${encodeURIComponent('%_\\')}`);
  assert.equal(literalResponse.statusCode, 200, literalResponse.body);
  const literal = literalResponse.json<ListJobsResponse>();
  assert.deepEqual(literal.data.map((job) => job.id), ['literal']);
});

test('persists provider updates, output and error JSON, and update timestamps', async () => {
  const sora = getAdapter('sora');
  const submitted = mock.method(sora, 'submit', async () => ({
    providerJobId: 'provider-job-1',
    status: 'running' as const,
    progressPct: 5,
  }));
  const outputs: CanonicalVideoAsset[] = [
    { kind: 'video/mp4', uri: 'https://example.com/output.mp4', bytesBase64: 'dmlkZW8=' },
  ];
  const refreshed = mock.method(sora, 'refresh', async () => ({
    status: 'succeeded' as const,
    progressPct: 100,
    outputs,
  }));
  const created = await createJob({ provider: 'sora', prompt: 'Keep these params', params: { seed: 9 } });
  // Use a known old timestamp to avoid timer-dependent assertions.
  await db.update(videoJobs).set({ updatedAt: new Date(0) }).where(eq(videoJobs.id, created.id));
  const running = await refreshJob(created.id);
  assert.equal(submitted.mock.callCount(), 1);
  assert.equal(running.providerJobId, 'provider-job-1');
  assert.equal(running.status, 'running');
  assert.equal(running.progressPct, 5);
  assert.ok(Date.parse(running.updatedAt) > 0);
  assert.equal(running.createdAt, created.createdAt);

  const completed = await refreshJob(created.id);
  assert.equal(refreshed.mock.callCount(), 1);
  assert.equal(completed.status, 'succeeded');
  assert.deepEqual(completed.outputs, outputs);
  assert.deepEqual(completed.params, { seed: 9 });
  await refreshJob(created.id);
  assert.equal(refreshed.mock.callCount(), 1, 'terminal jobs should not call a provider again');

  const failed = await createJob({ provider: 'sora', prompt: 'Failure detail' });
  await refreshJob(failed.id);
  const error = { message: 'Provider rejected request', raw: ['reason', 'detail'] };
  refreshed.mock.mockImplementation(async () => ({ status: 'failed' as const, progressPct: null, error }));
  const failure = await refreshJob(failed.id);
  assert.equal(failure.status, 'failed');
  assert.equal(failure.progressPct, null);
  assert.deepEqual(failure.error, error);
  const stored = await db.select().from(videoJobs).where(eq(videoJobs.id, failed.id)).get();
  assert.deepEqual(stored?.errorJson, error);
});

test('persists remix and extension jobs with their source metadata', async () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const outputs: CanonicalVideoAsset[] = [{ kind: 'video/mp4', uri: 'https://example.com/source.mp4' }];
  await db.insert(videoJobs).values([
    {
      id: 'sora-source', provider: 'sora', providerJobId: 'sora-source-provider',
      prompt: 'Original Sora prompt', status: 'succeeded', paramsJson: { seed: 11 },
      outputsJson: outputs, createdAt,
    },
    {
      id: 'veo-source', provider: 'veo', providerJobId: 'operations/veo-source',
      prompt: 'Original Veo prompt', status: 'succeeded', paramsJson: { duration: 4 },
      outputsJson: outputs, createdAt,
    },
  ]);
  const sora = getAdapter('sora');
  const veo = getAdapter('veo');
  assert.ok(sora instanceof SoraAdapterStub);
  assert.ok(veo instanceof VeoAdapterStub);
  const remix = mock.method(sora, 'remix', async () => ({
    providerJobId: 'sora-remix-provider', status: 'running' as const, progressPct: 0,
  }));
  const extend = mock.method(veo, 'extend', async () => ({
    providerJobId: 'operations/veo-extended', status: 'queued' as const, progressPct: null,
  }));

  const remixResponse = await app.inject({
    method: 'POST', url: '/api/jobs/sora-source/remix', payload: { prompt: 'Changed prompt' },
  });
  assert.equal(remixResponse.statusCode, 201, remixResponse.body);
  const remixJob = remixResponse.json<{ data: CanonicalVideoJob }>().data;
  assert.equal(remixJob.prompt, 'Changed prompt');
  assert.equal(remixJob.providerJobId, 'sora-remix-provider');
  assert.deepEqual(remixJob.params, {
    seed: 11, mode: 'remix', sourceJobId: 'sora-source', sourceProviderJobId: 'sora-source-provider',
  });
  assert.equal(remix.mock.callCount(), 1);

  const extendResponse = await app.inject({
    method: 'POST', url: '/api/jobs/veo-source/extend',
    payload: { sourceAssetIndex: 0, params: { duration: 8, nested: { sound: true } } },
  });
  assert.equal(extendResponse.statusCode, 201, extendResponse.body);
  const extensionJob = extendResponse.json<{ data: CanonicalVideoJob }>().data;
  assert.equal(extensionJob.prompt, 'Original Veo prompt');
  assert.equal(extensionJob.providerJobId, 'operations/veo-extended');
  assert.deepEqual(extensionJob.params, {
    duration: 8, nested: { sound: true }, mode: 'extend',
    sourceJobId: 'veo-source', sourceProviderJobId: 'operations/veo-source',
  });
  assert.equal(extend.mock.callCount(), 1);
  const persisted = await app.inject(`/api/jobs/${extensionJob.id}`);
  assert.deepEqual(persisted.json().data, extensionJob);
});
