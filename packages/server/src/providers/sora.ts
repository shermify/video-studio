import type {
  ProviderAdapter,
  ProviderSubmitResult,
  ProviderRefreshResult,
  ProviderContentResult,
  ProviderMetadata,
  ProviderJobContext,
  RemixParams,
} from './types.js';
import type { CanonicalJobStatus, CanonicalVideoAsset } from '@video/types';

const SORA_API_BASE = 'https://api.openai.com/v1/videos';

/**
 * Sora API video job response shape
 */
interface SoraVideoJob {
  id: string;
  object: 'video';
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  completed_at?: number;
  expires_at?: number;
  prompt?: string;
  seconds?: string;
  size?: string;
  quality?: string;
  remixed_from_video_id?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

/**
 * Map Sora status to canonical status
 */
function mapStatus(soraStatus: SoraVideoJob['status']): CanonicalJobStatus {
  switch (soraStatus) {
    case 'queued':
      return 'queued';
    case 'in_progress':
      return 'running';
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

/**
 * Real Sora adapter that connects to OpenAI's Sora API
 */
export class SoraAdapter implements ProviderAdapter {
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
      {
        id: 'image-to-video',
        label: 'Image to Video',
        description: 'Generate video from a reference image',
      },
    ],
    capabilities: {
      remix: true,
      extend: false,
      referenceImage: true,
    },
  };

  private getApiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    return key;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${SORA_API_BASE}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.error?.message || parsed.message || errorBody;
      } catch {
        errorMessage = errorBody;
      }
      throw new Error(`Sora API error (${response.status}): ${errorMessage}`);
    }

    return response.json() as Promise<T>;
  }

  async submit(job: ProviderJobContext): Promise<ProviderSubmitResult> {
    const params = job.params || {};

    // Build form data for multipart request
    const formData = new FormData();
    formData.append('prompt', job.prompt);
    formData.append('model', (params.model as string) || 'sora-2');

    if (params.seconds) {
      formData.append('seconds', String(params.seconds));
    }
    if (params.size) {
      formData.append('size', params.size as string);
    }

    // Handle reference image for image-to-video
    if (params.inputReference) {
      const ref = params.inputReference as {
        bytesBase64Encoded: string;
        mimeType: string;
      };
      const buffer = Buffer.from(ref.bytesBase64Encoded, 'base64');
      const blob = new Blob([buffer], { type: ref.mimeType });
      formData.append('input_reference', blob, `reference.${ref.mimeType.split('/')[1] || 'png'}`);
    }

    const response = await fetch(SORA_API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.error?.message || parsed.message || errorBody;
      } catch {
        errorMessage = errorBody;
      }
      throw new Error(`Sora API error (${response.status}): ${errorMessage}`);
    }

    const video = (await response.json()) as SoraVideoJob;

    return {
      providerJobId: video.id,
      status: mapStatus(video.status),
      progressPct: video.progress ?? 0,
    };
  }

  async refresh(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    if (!job.providerJobId) {
      throw new Error('Cannot refresh job without providerJobId');
    }

    const video = await this.request<SoraVideoJob>(`/${job.providerJobId}`);

    const result: ProviderRefreshResult = {
      status: mapStatus(video.status),
      progressPct: video.progress ?? null,
    };

    // If completed, build output asset pointing to content endpoint
    if (video.status === 'completed') {
      result.outputs = [
        {
          kind: 'video/mp4',
          uri: `sora://${video.id}/content`, // Internal URI, resolved by content() method
        },
      ];
    }

    // If failed, include error info
    if (video.status === 'failed' && video.error) {
      result.error = {
        message: video.error.message || 'Video generation failed',
        raw: video.error.code,
      };
    }

    return result;
  }

  async delete(job: ProviderJobContext): Promise<void> {
    if (!job.providerJobId) {
      // Nothing to delete on provider side
      return;
    }

    await this.request(`/${job.providerJobId}`, {
      method: 'DELETE',
    });
  }

  async content(
    job: ProviderJobContext,
    _assetIndex: number
  ): Promise<ProviderContentResult> {
    if (!job.providerJobId) {
      throw new Error('Cannot get content without providerJobId');
    }

    // Fetch the video content as a stream
    const url = `${SORA_API_BASE}/${job.providerJobId}/content`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.getApiKey()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video content: ${response.status}`);
    }

    // Return stream info for the caller to pipe to client
    return {
      type: 'stream',
      contentType: response.headers.get('content-type') || 'video/mp4',
      stream: response.body as ReadableStream<Uint8Array>,
    };
  }

  async remix(
    job: ProviderJobContext,
    params: RemixParams
  ): Promise<ProviderSubmitResult> {
    if (!job.providerJobId) {
      throw new Error('Cannot remix job without providerJobId');
    }

    if (job.status !== 'succeeded') {
      throw new Error('Can only remix completed videos');
    }

    const prompt = params.prompt || job.prompt;

    const response = await this.request<SoraVideoJob>(
      `/${job.providerJobId}/remix`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      }
    );

    return {
      providerJobId: response.id,
      status: mapStatus(response.status),
      progressPct: response.progress ?? 0,
    };
  }
}
