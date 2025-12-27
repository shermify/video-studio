import type { CanonicalJobStatus, CanonicalVideoAsset } from '@video/types';

/**
 * Result from submitting a job to a provider
 */
export interface ProviderSubmitResult {
  providerJobId: string;
  status: CanonicalJobStatus;
  progressPct?: number | null;
}

/**
 * Result from refreshing/polling a job's status
 */
export interface ProviderRefreshResult {
  status: CanonicalJobStatus;
  progressPct?: number | null;
  outputs?: CanonicalVideoAsset[];
  error?: { message: string; raw?: string | string[] } | null;
}

/**
 * Result for content retrieval - either a redirect URL or stream info
 */
export interface ProviderContentResult {
  type: 'redirect' | 'stream';
  url?: string;
  contentType?: string;
  stream?: ReadableStream<Uint8Array>;
}

/**
 * Provider mode configuration
 */
export interface ProviderMode {
  id: string;
  label: string;
  description?: string;
}

/**
 * Provider metadata for UI
 */
export interface ProviderMetadata {
  id: string;
  name: string;
  modes: ProviderMode[];
  capabilities: {
    remix: boolean;
    extend: boolean;
    referenceImage: boolean;
  };
}

/**
 * Base interface for video generation provider adapters
 */
export interface ProviderAdapter {
  readonly providerId: string;
  readonly metadata: ProviderMetadata;

  /**
   * Submit a new job to the provider
   */
  submit(job: ProviderJobContext): Promise<ProviderSubmitResult>;

  /**
   * Refresh/poll job status from the provider
   */
  refresh(job: ProviderJobContext): Promise<ProviderRefreshResult>;

  /**
   * Delete a job from the provider (if supported)
   */
  delete(job: ProviderJobContext): Promise<void>;

  /**
   * Get content (video asset) from the provider
   */
  content(
    job: ProviderJobContext,
    assetIndex: number
  ): Promise<ProviderContentResult>;

  /**
   * Remix a completed video (Sora-specific)
   */
  remix?(
    job: ProviderJobContext,
    params: RemixParams
  ): Promise<ProviderSubmitResult>;

  /**
   * Extend a completed video (Veo-specific)
   */
  extend?(
    job: ProviderJobContext,
    params: ExtendParams
  ): Promise<ProviderSubmitResult>;
}

/**
 * Context passed to adapter methods containing job info
 */
export interface ProviderJobContext {
  id: string;
  providerJobId: string | null;
  prompt: string;
  params: Record<string, unknown>;
  status: CanonicalJobStatus;
  outputs: CanonicalVideoAsset[];
}

/**
 * Parameters for remix operation
 */
export interface RemixParams {
  prompt?: string;
  sourceAssetIndex?: number;
  params?: Record<string, unknown>;
}

/**
 * Parameters for extend operation
 */
export interface ExtendParams {
  prompt?: string;
  sourceAssetIndex?: number;
  params?: Record<string, unknown>;
}
