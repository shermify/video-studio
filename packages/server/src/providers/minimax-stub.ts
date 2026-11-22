import { randomUUID } from 'node:crypto';
import { MiniMaxAdapter, normalizeMiniMaxParams } from './minimax.js';
import { providerCatalog } from './catalog.js';
import type { ProviderAdapter, ProviderJobContext, ProviderRefreshResult, RegenerateParams } from './types.js';

/** Exercises the same input rules without uploading files or requesting generation. */
export class MiniMaxAdapterStub implements ProviderAdapter {
  readonly providerId = 'minimax';
  readonly metadata = { ...providerCatalog.minimax, isStub: true };
  readonly archiveOutputs = false;
  private readonly validation = new MiniMaxAdapter();
  private readonly polls = new Map<string, number>();

  validateInput(job: ProviderJobContext) { return this.validation.validateInput(job); }
  validateRegeneration(source: ProviderJobContext, params: RegenerateParams) {
    return this.validation.validateRegeneration(source, params);
  }

  async submit(job: ProviderJobContext) {
    await this.validateInput(job);
    return { providerJobId: `minimax_stub_${randomUUID()}`, status: 'queued' as const, progressPct: null };
  }

  async refresh(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    const polls = (this.polls.get(job.id) ?? 0) + 1;
    this.polls.set(job.id, polls);
    const done = polls >= 3;
    return {
      status: done ? 'succeeded' : 'running', progressPct: done ? 100 : null,
      ...(done ? { outputs: [{ kind: 'video/mp4', uri: `https://example.com/stub/minimax/${job.providerJobId}/output.mp4` }] } : {}),
      metadata: { ...normalizeMiniMaxParams(job), simulated: true },
    };
  }

  async cancel(_job: ProviderJobContext) { return { status: 'canceled' as const }; }
  async delete(_job: ProviderJobContext) {}
  async content(job: ProviderJobContext, _assetIndex: number) {
    return { type: 'redirect' as const, url: `https://example.com/stub/minimax/${job.providerJobId}/output.mp4` };
  }
  async regenerate(source: ProviderJobContext, params: RegenerateParams) {
    await this.validateRegeneration(source, params);
    return { providerJobId: `minimax_stub_regenerated_${randomUUID()}`, status: 'queued' as const, progressPct: null };
  }
}
