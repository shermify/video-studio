import { readFileSync } from 'fs';
import { createSign } from 'crypto';
import type {
  ProviderAdapter,
  ProviderSubmitResult,
  ProviderRefreshResult,
  ProviderContentResult,
  ProviderMetadata,
  ProviderJobContext,
  ExtendParams,
} from './types.js';
import type { CanonicalJobStatus, CanonicalVideoAsset } from '@video/types';

const DEFAULT_MODEL = 'veo-3.1-generate-preview';
const DEFAULT_LOCATION = 'us-central1';
const TOKEN_LIFETIME_SECONDS = 3600; // 1 hour
const TOKEN_REFRESH_MARGIN_SECONDS = 300; // Refresh 5 minutes before expiry

/**
 * Service account credentials structure
 */
interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

/**
 * Veo API response for predictLongRunning
 */
interface VeoPredictResponse {
  name: string; // Operation name
}

/**
 * Veo API response for fetchPredictOperation
 */
interface VeoOperationResponse {
  name: string;
  done?: boolean;
  error?: {
    code: number;
    message: string;
    details?: unknown[];
  };
  response?: {
    '@type': string;
    raiMediaFilteredCount?: number;
    raiMediaFilteredReasons?: string[];
    videos?: Array<{
      gcsUri?: string;
      bytesBase64Encoded?: string;
      mimeType?: string;
    }>;
  };
}

/**
 * Cached access token
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Real Veo adapter that connects to Google Cloud's Vertex AI Veo API
 */
export class VeoAdapter implements ProviderAdapter {
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

  private cachedToken: CachedToken | null = null;
  private credentials: ServiceAccountCredentials | null = null;

  private getCredentials(): ServiceAccountCredentials {
    if (this.credentials) {
      return this.credentials;
    }

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      throw new Error(
        'GOOGLE_APPLICATION_CREDENTIALS environment variable is not set'
      );
    }

    try {
      const credentialsJson = readFileSync(credentialsPath, 'utf-8');
      this.credentials = JSON.parse(
        credentialsJson
      ) as ServiceAccountCredentials;
      return this.credentials;
    } catch (error) {
      throw new Error(`Failed to read service account credentials: ${error}`);
    }
  }

  private getProjectId(): string {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (projectId) {
      return projectId;
    }
    // Fall back to project_id from credentials
    return this.getCredentials().project_id;
  }

  private getLocation(): string {
    return process.env.GOOGLE_CLOUD_LOCATION || DEFAULT_LOCATION;
  }

  private getModel(params?: Record<string, unknown>): string {
    return (params?.model as string) || process.env.VEO_MODEL || DEFAULT_MODEL;
  }

  /**
   * Create a signed JWT for service account authentication
   */
  private createSignedJwt(): string {
    const credentials = this.getCredentials();
    const now = Math.floor(Date.now() / 1000);

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: credentials.private_key_id,
    };

    const payload = {
      iss: credentials.client_email,
      sub: credentials.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + TOKEN_LIFETIME_SECONDS,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      'base64url'
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url'
    );
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const sign = createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(credentials.private_key, 'base64url');

    return `${signatureInput}.${signature}`;
  }

  /**
   * Exchange JWT for access token
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt > now + TOKEN_REFRESH_MARGIN_SECONDS * 1000
    ) {
      return this.cachedToken.accessToken;
    }

    const jwt = this.createSignedJwt();

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to get access token: ${response.status} ${errorBody}`
      );
    }

    const tokenResponse = (await response.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    this.cachedToken = {
      accessToken: tokenResponse.access_token,
      expiresAt: now + tokenResponse.expires_in * 1000,
    };

    return this.cachedToken.accessToken;
  }

  /**
   * Get the base URL for Vertex AI API
   */
  private getBaseUrl(): string {
    const location = this.getLocation();
    return `https://${location}-aiplatform.googleapis.com/v1`;
  }

  /**
   * Get the model path for API requests
   */
  private getModelPath(model: string): string {
    const projectId = this.getProjectId();
    const location = this.getLocation();
    return `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
  }

  /**
   * Make an authenticated request to the Vertex AI API
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const accessToken = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
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
      throw new Error(`Veo API error (${response.status}): ${errorMessage}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Check if a model supports audio generation
   */
  private supportsAudio(model: string): boolean {
    return model.startsWith('veo-3');
  }

  /**
   * Check if a model supports extend
   */
  private supportsExtend(model: string): boolean {
    return (
      model.includes('veo-2.0-generate-001') || model.startsWith('veo-3.1')
    );
  }

  async submit(job: ProviderJobContext): Promise<ProviderSubmitResult> {
    const params = job.params || {};
    const model = this.getModel(params);

    // Build instance object
    const instance: Record<string, unknown> = {
      prompt: job.prompt,
    };

    // Handle image-to-video mode (first frame)
    if (params.image) {
      instance.image = params.image;
    }

    // Handle last frame guidance
    if (params.lastFrame) {
      instance.lastFrame = params.lastFrame;
    }

    // Handle reference images (up to 3 for asset type, 1 for style type)
    // These are different from first/last frame - they guide subject/style appearance
    if (params.referenceImages && Array.isArray(params.referenceImages)) {
      instance.referenceImages = params.referenceImages;
    }

    // Build parameters object
    const parameters: Record<string, unknown> = {
      aspectRatio: (params.aspectRatio as string) || '16:9',
      sampleCount: 1,
    };

    // Duration (Veo 3.x supports 4, 6, 8)
    if (params.durationSeconds) {
      parameters.durationSeconds = params.durationSeconds;
    }

    // Resolution (Veo 3 only)
    if (params.resolution && model.startsWith('veo-3')) {
      parameters.resolution = params.resolution;
    }

    // Audio generation (Veo 3 only)
    if (this.supportsAudio(model)) {
      parameters.generateAudio = params.generateAudio !== false; // Default true for veo-3
    }

    // Negative prompt
    if (params.negativePrompt) {
      parameters.negativePrompt = params.negativePrompt;
    }

    // Seed
    if (params.seed !== undefined) {
      parameters.seed = params.seed;
    }

    const requestBody = {
      instances: [instance],
      parameters,
    };

    const modelPath = this.getModelPath(model);
    const response = await this.request<VeoPredictResponse>(
      `${modelPath}:predictLongRunning`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }
    );

    return {
      providerJobId: response.name,
      status: 'running',
      progressPct: null,
    };
  }

  /**
   * Extract location from an operation name
   * Operation names look like: projects/PROJECT/locations/LOCATION/publishers/google/models/MODEL/operations/OP_ID
   */
  private extractLocationFromOperationName(
    operationName: string
  ): string | null {
    const match = operationName.match(/locations\/([^/]+)/);
    return match ? match[1] : null;
  }

  async refresh(job: ProviderJobContext): Promise<ProviderRefreshResult> {
    if (!job.providerJobId) {
      throw new Error('Cannot refresh job without providerJobId');
    }

    // Extract location from the operation name - the operation is tied to the location where it was created
    const operationLocation = this.extractLocationFromOperationName(
      job.providerJobId
    );
    const location = operationLocation || this.getLocation();
    const projectId = this.getProjectId();
    const model = this.getModel(job.params);
    const modelPath = `projects/${projectId}/locations/${location}/publishers/google/models/${model}`;
    const baseUrl = `https://${location}-aiplatform.googleapis.com/v1`;

    const accessToken = await this.getAccessToken();
    const url = `${baseUrl}/${modelPath}:fetchPredictOperation`;

    const fetchResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationName: job.providerJobId,
      }),
    });

    if (!fetchResponse.ok) {
      const errorBody = await fetchResponse.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.error?.message || parsed.message || errorBody;
      } catch {
        errorMessage = errorBody;
      }
      throw new Error(
        `Veo API error (${fetchResponse.status}): ${errorMessage}`
      );
    }

    const response = (await fetchResponse.json()) as VeoOperationResponse;

    // Operation still running
    if (!response.done) {
      return {
        status: 'running',
        progressPct: null,
      };
    }

    // Operation failed
    if (response.error) {
      return {
        status: 'failed',
        progressPct: null,
        error: {
          message: response.error.message || 'Video generation failed',
          raw: String(response.error.code),
        },
      };
    }

    // Operation succeeded
    if (response.response?.videos && response.response.videos.length > 0) {
      const outputs: CanonicalVideoAsset[] = response.response.videos.map(
        (video, index) => {
          // Store base64 data in the asset for later content retrieval
          if (video.bytesBase64Encoded) {
            return {
              kind: 'video/mp4' as const,
              uri: `veo://${job.id}/output_${index}`,
              bytesBase64: video.bytesBase64Encoded,
            };
          }
          // GCS URI fallback (shouldn't happen with our config)
          return {
            kind: 'video/mp4' as const,
            uri: video.gcsUri || `veo://${job.id}/output_${index}`,
          };
        }
      );

      // Check for RAI filtering
      if (
        response.response.raiMediaFilteredCount &&
        response.response.raiMediaFilteredCount > 0
      ) {
        return {
          status: 'failed',
          progressPct: null,
          outputs,
          error: {
            message: `${response.response.raiMediaFilteredCount} video(s) filtered by content policy`,
            raw: response.response.raiMediaFilteredReasons,
          },
        };
      }

      return {
        status: 'succeeded',
        progressPct: 100,
        outputs,
      };
    }

    // Unknown state
    return {
      status: 'failed',
      progressPct: null,
      error: {
        message: 'Operation completed but no videos returned',
      },
    };
  }

  async delete(_job: ProviderJobContext): Promise<void> {
    // Veo operations auto-expire, no explicit delete API
    return;
  }

  async content(
    job: ProviderJobContext,
    assetIndex: number
  ): Promise<ProviderContentResult> {
    // Get the output asset
    const output = job.outputs[assetIndex];
    if (!output) {
      throw new Error(`Asset index ${assetIndex} not found`);
    }

    // If we have base64 data stored, decode and stream it
    if (output.bytesBase64) {
      const buffer = Buffer.from(output.bytesBase64, 'base64');
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        },
      });

      return {
        type: 'stream',
        contentType: 'video/mp4',
        stream,
      };
    }

    // If it's a GCS URI, we'd need to fetch it (not implemented since we use base64)
    if (output.uri.startsWith('gs://')) {
      throw new Error(
        'GCS URI content retrieval not implemented - use base64 mode'
      );
    }

    throw new Error('No content available for this asset');
  }

  async extend(
    job: ProviderJobContext,
    params: ExtendParams
  ): Promise<ProviderSubmitResult> {
    if (!job.providerJobId) {
      throw new Error('Cannot extend job without providerJobId');
    }

    if (job.status !== 'succeeded') {
      throw new Error('Can only extend completed videos');
    }

    const model = this.getModel(params.params);

    if (!this.supportsExtend(model)) {
      throw new Error(`Model ${model} does not support video extension`);
    }

    // Get the video content from the source job
    const sourceAssetIndex = params.sourceAssetIndex ?? 0;
    const sourceAsset = job.outputs[sourceAssetIndex];
    if (!sourceAsset) {
      throw new Error(`Source asset index ${sourceAssetIndex} not found`);
    }

    if (!sourceAsset.bytesBase64) {
      throw new Error('Source video must have base64 content for extension');
    }

    // Build instance object with video input
    const instance: Record<string, unknown> = {
      video: {
        bytesBase64Encoded: sourceAsset.bytesBase64,
        mimeType: 'video/mp4',
      },
    };

    // Add prompt if provided
    if (params.prompt) {
      instance.prompt = params.prompt;
    }

    // Build parameters
    const extendParams = params.params || {};
    const parameters: Record<string, unknown> = {
      aspectRatio: (extendParams.aspectRatio as string) || '16:9',
      sampleCount: 1,
    };

    if (extendParams.durationSeconds) {
      parameters.durationSeconds = extendParams.durationSeconds;
    }

    if (this.supportsAudio(model)) {
      parameters.generateAudio = extendParams.generateAudio !== false;
    }

    const requestBody = {
      instances: [instance],
      parameters,
    };

    const modelPath = this.getModelPath(model);
    const response = await this.request<VeoPredictResponse>(
      `${modelPath}:predictLongRunning`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
      }
    );

    return {
      providerJobId: response.name,
      status: 'running',
      progressPct: null,
    };
  }
}
