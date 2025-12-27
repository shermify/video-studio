import type {
  ProviderAdapter,
  ProviderSubmitResult,
  ProviderRefreshResult,
  ProviderContentResult,
  ProviderMetadata,
  ProviderJobContext,
  RemixParams,
} from './types.js';

/**
 * Stub adapter for Sora - simulates provider behavior without real API calls
 */
export class SoraAdapterStub implements ProviderAdapter {
  readonly providerId = 'sora';

  readonly metadata: ProviderMetadata = {
    id: 'sora',
    name: 'Sora',
    modes: [
      {
        id: 'generate',
        label: 'Generate',
        description: 'Generate a new video from prompt',
      },
      {
        id: 'remix',
        label: 'Remix',
        description: 'Remix an existing video with modifications',
      },
    ],
    capabilities: {
      remix: true,
      extend: false,
      referenceImage: false,
    },
  };

  // Track fake job states for simulation
  private jobStates = new Map<
    string,
    { callCount: number; completed: boolean }
  >();

  async submit(job: ProviderJobContext): Promise<ProviderSubmitResult> {
    // Generate a fake provider job ID
    const providerJobId = `sora_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Initialize tracking state
    this.jobStates.set(job.id, { callCount: 0, completed: false });

    return {
      providerJobId,
      status: 'running',
      progressPct: 0,
    };
  }

  async refresh(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    // Simulate progress over multiple refresh calls
    const state = this.jobStates.get(job.id) ?? {
      callCount: 0,
      completed: false,
    };
    state.callCount++;
    this.jobStates.set(job.id, state);

    // Simulate completion after 3 refreshes
    if (state.callCount >= 3 || state.completed) {
      state.completed = true;
      return {
        status: 'succeeded',
        progressPct: 100,
        outputs: [
          {
            kind: 'video/mp4',
            uri: `https://example.com/stub/sora/${job.providerJobId}/output.mp4`,
          },
        ],
      };
    }

    // Simulate progress
    const progressPct = Math.min(state.callCount * 30, 90);

    return {
      status: 'running',
      progressPct,
    };
  }

  async delete(_job: ProviderJobContext): Promise<void> {
    // Stub: nothing to delete externally
  }

  async content(
    job: ProviderJobContext,
    assetIndex: number
  ): Promise<ProviderContentResult> {
    // Return a redirect to the stub URL
    return {
      type: 'redirect',
      url: `https://example.com/stub/sora/${job.providerJobId}/output_${assetIndex}.mp4`,
    };
  }

  async remix(
    job: ProviderJobContext,
    params: RemixParams
  ): Promise<ProviderSubmitResult> {
    // Generate a new provider job ID for the remix
    const providerJobId = `sora_remix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Initialize tracking state
    this.jobStates.set(job.id, { callCount: 0, completed: false });

    return {
      providerJobId,
      status: 'running',
      progressPct: 0,
    };
  }
}
