import type {
  ProviderAdapter,
  ProviderSubmitResult,
  ProviderRefreshResult,
  ProviderContentResult,
  ProviderMetadata,
  ProviderJobContext,
  ExtendParams,
} from './types.js';

/**
 * Stub adapter for Veo - simulates provider behavior without real API calls
 */
export class VeoAdapterStub implements ProviderAdapter {
  readonly providerId = 'veo';

  readonly metadata: ProviderMetadata = {
    id: 'veo',
    name: 'Veo',
    modes: [
      {
        id: 'generate',
        label: 'Generate',
        description: 'Generate a new video from prompt',
      },
      {
        id: 'extend',
        label: 'Extend',
        description: 'Extend an existing video',
      },
      {
        id: 'image-to-video',
        label: 'Image to Video',
        description: 'Generate video from reference image',
      },
    ],
    capabilities: {
      remix: false,
      extend: true,
      referenceImage: true,
    },
  };

  // Track fake job states for simulation (using operation name as key)
  private operationStates = new Map<
    string,
    { callCount: number; completed: boolean }
  >();

  async submit(job: ProviderJobContext): Promise<ProviderSubmitResult> {
    // Veo uses "operation names" instead of simple IDs
    const providerJobId = `operations/veo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Initialize tracking state
    this.operationStates.set(job.id, { callCount: 0, completed: false });

    return {
      providerJobId,
      status: 'running',
      // Veo typically doesn't provide progress percentage
      progressPct: null,
    };
  }

  async refresh(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    // Simulate progress over multiple refresh calls
    const state = this.operationStates.get(job.id) ?? {
      callCount: 0,
      completed: false,
    };
    state.callCount++;
    this.operationStates.set(job.id, state);

    // Simulate completion after 4 refreshes (Veo is typically slower)
    if (state.callCount >= 4 || state.completed) {
      state.completed = true;
      return {
        status: 'succeeded',
        progressPct: 100,
        outputs: [
          {
            kind: 'video/mp4',
            uri: `https://example.com/stub/veo/${job.providerJobId?.replace('operations/', '')}/output.mp4`,
          },
        ],
      };
    }

    // Veo doesn't typically provide progress, just running state
    return {
      status: 'running',
      progressPct: null,
    };
  }

  async delete(_job: ProviderJobContext): Promise<void> {
    // Stub: nothing to delete externally
  }

  async content(
    job: ProviderJobContext,
    assetIndex: number
  ): Promise<ProviderContentResult> {
    const operationId =
      job.providerJobId?.replace('operations/', '') ?? 'unknown';
    return {
      type: 'redirect',
      url: `https://example.com/stub/veo/${operationId}/output_${assetIndex}.mp4`,
    };
  }

  async extend(
    job: ProviderJobContext,
    params: ExtendParams
  ): Promise<ProviderSubmitResult> {
    // Generate a new operation name for the extension
    const providerJobId = `operations/veo_extend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Initialize tracking state
    this.operationStates.set(job.id, { callCount: 0, completed: false });

    return {
      providerJobId,
      status: 'running',
      progressPct: null,
    };
  }
}
