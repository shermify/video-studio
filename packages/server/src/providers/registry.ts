import type { ProviderAdapter, ProviderMetadata } from './types.js';
import { SoraAdapter } from './sora.js';
import { SoraAdapterStub } from './sora-stub.js';
import { VeoAdapter } from './veo.js';
import { VeoAdapterStub } from './veo-stub.js';

// Singleton instances of adapters
const adapters: Map<string, ProviderAdapter> = new Map();

// Use real adapter if API key is available, otherwise use stub
const useStubs = process.env.USE_STUB_ADAPTERS === 'true';

const soraAdapter =
  useStubs || !process.env.OPENAI_API_KEY
    ? new SoraAdapterStub()
    : new SoraAdapter();

// Use real Veo adapter if credentials are available
const veoAdapter =
  useStubs || !process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new VeoAdapterStub()
    : new VeoAdapter();

adapters.set('sora', soraAdapter);
adapters.set('veo', veoAdapter);

/**
 * Get a provider adapter by ID
 * @throws Error if provider is not registered
 */
export function getAdapter(providerId: string): ProviderAdapter {
  const adapter = adapters.get(providerId);
  if (!adapter) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return adapter;
}

/**
 * Get all registered provider IDs
 */
export function getProviderIds(): string[] {
  return Array.from(adapters.keys());
}

/**
 * Get metadata for all registered providers
 */
export function getAllProviderMetadata(): ProviderMetadata[] {
  return Array.from(adapters.values()).map((adapter) => adapter.metadata);
}

/**
 * Check if a provider is registered
 */
export function hasProvider(providerId: string): boolean {
  return adapters.has(providerId);
}
