import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SoraAdapter } from './sora.js';
import { VeoAdapter } from './veo.js';
import { ProviderRequestError, type ProviderJobContext } from './types.js';

const job: ProviderJobContext = {
  id: 'local', providerJobId: null, prompt: 'Keep the prompt unchanged',
  params: {}, status: 'queued', outputs: [],
};
const fakeFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch =>
  ((url, init) => handler(String(url), init ?? {})) as typeof fetch;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function adapters(fetch: typeof globalThis.fetch) {
  return [
    new SoraAdapter({ apiKey: 'fake-sora-key', fetch }),
    new VeoAdapter({ accessToken: 'fake-veo-token', projectId: 'test-project', location: 'us-central1', fetch }),
  ];
}

test('existing provider submissions retain their payloads and carry finite abort signals', async () => {
  const sora = new SoraAdapter({ apiKey: 'fake-sora-key', fetch: fakeFetch(async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/videos');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer fake-sora-key');
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get('prompt'), job.prompt);
    assert.equal(init.body.get('model'), 'sora-2');
    assert.equal(init.body.get('seconds'), '8');
    assert.equal(init.body.get('size'), '1280x720');
    assert.deepEqual(Buffer.from(await (init.body.get('input_reference') as File).arrayBuffer()), Buffer.from('original image'));
    return response({ id: 'sora-result', status: 'queued', progress: 0 });
  }) });
  assert.equal((await sora.submit({ ...job, params: {
    model: 'sora-2', seconds: '8', size: '1280x720',
    inputReference: { bytesBase64Encoded: Buffer.from('original image').toString('base64'), mimeType: 'image/png' },
  } })).providerJobId, 'sora-result');

  const veo = new VeoAdapter({ accessToken: 'fake-token', projectId: 'test-project', location: 'us-central1', fetch: fakeFetch((url, init) => {
    assert.ok(url.endsWith('/projects/test-project/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning'));
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(String(init.body)), {
      instances: [{ prompt: job.prompt }], parameters: {
        aspectRatio: '9:16', sampleCount: 1, durationSeconds: 8, resolution: '1080p', generateAudio: false,
      },
    });
    return response({ name: 'operations/veo-result' });
  }) });
  assert.equal((await veo.submit({ ...job, params: {
    model: 'veo-3.1-generate-preview', aspectRatio: '9:16', durationSeconds: 8, resolution: '1080p', generateAudio: false,
  } })).providerJobId, 'operations/veo-result');
});

test('existing providers distinguish explicit rejection from transport and server ambiguity without retrying', async () => {
  for (const status of [400, 429, 500]) {
    for (const index of [0, 1]) {
      let calls = 0;
      const adapter = adapters(fakeFetch((_url, init) => {
        calls++; assert.ok(init.signal instanceof AbortSignal);
        return response({ error: { code: 'provider-code', message: 'Useful error detail' }, request_id: 'trace-id' }, status);
      }))[index];
      await assert.rejects(adapter.submit(job), (error: unknown) => error instanceof ProviderRequestError
        && error.definiteRejection === (status < 500) && error.code === 'provider-code' && error.requestId === 'trace-id');
      assert.equal(calls, 1);
    }
  }
  for (const index of [0, 1]) {
    let calls = 0;
    const adapter = adapters(fakeFetch(() => { calls++; throw new TypeError('disconnected'); }))[index];
    await assert.rejects(adapter.submit(job), (error: unknown) => error instanceof ProviderRequestError && !error.definiteRejection);
    assert.equal(calls, 1);
  }
});

test('safe provider queries and Sora content downloads use finite signals', async () => {
  const sora = new SoraAdapter({ apiKey: 'fake-sora-key', fetch: fakeFetch((url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    return url.endsWith('/content') ? new Response('video', { headers: { 'Content-Type': 'video/mp4' } })
      : response({ id: 'sora-result', status: 'completed', progress: 100 });
  }) });
  assert.equal((await sora.refresh({ ...job, providerJobId: 'sora-result' })).status, 'succeeded');
  const content = await sora.content({ ...job, providerJobId: 'sora-result' }, 0);
  assert.equal(await new Response(content.stream).text(), 'video');

  const veo = new VeoAdapter({ accessToken: 'fake-token', projectId: 'test-project', location: 'us-central1', fetch: fakeFetch((url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    assert.ok(url.includes('us-east1-aiplatform'));
    assert.ok(url.endsWith(':fetchPredictOperation'));
    return response({ done: false });
  }) });
  assert.equal((await veo.refresh({ ...job, providerJobId: 'projects/test-project/locations/us-east1/publishers/google/models/veo-3.1-generate-preview/operations/1' })).status, 'running');
});

test('Sora allows local deletion after a provider record has already been removed', async () => {
  const adapter = new SoraAdapter({ apiKey: 'fake-sora-key', fetch: fakeFetch((_url, init) => {
    assert.equal(init.method, 'DELETE'); return response({ error: { message: 'Not found' } }, 404);
  }) });
  await adapter.delete({ ...job, providerJobId: 'deleted', status: 'succeeded' });
});

test('a stalled provider request aborts at its deadline without a second attempt', async () => {
  const { fetchProvider } = await import('./http.js');
  let calls = 0;
  // AbortSignal timers do not retain the event loop; keep this short test alive.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetchProvider('Test provider', 'https://example.com/never-resolves', {},
      fakeFetch((_url, init) => {
        calls++;
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        });
      }), 5), (error: unknown) => error instanceof ProviderRequestError && !error.definiteRejection);
    assert.equal(calls, 1);
  } finally { clearTimeout(keepAlive); }
});
