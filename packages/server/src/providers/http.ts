import { ProviderRequestError } from './types.js';

/** One attempt with a finite deadline. POST transport failures remain ambiguous. */
export async function fetchProvider(
  provider: string,
  url: string,
  options: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs = 120_000
): Promise<Response> {
  let response: Response;
  try {
    const deadline = AbortSignal.timeout(timeoutMs);
    response = await fetchImpl(url, {
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
    });
  } catch (error) {
    throw new ProviderRequestError(`${provider} request could not be confirmed: ${error instanceof Error ? error.message : 'network failure'}`, {
      definiteRejection: false, code: 'PROVIDER_REQUEST_UNCONFIRMED',
    });
  }
  if (!response.ok) {
    let message = `${provider} HTTP ${response.status}`;
    let code: string | undefined;
    let requestId = response.headers.get('x-request-id') ?? undefined;
    try {
      const text = await response.text();
      try {
        const payload = JSON.parse(text) as {
          error?: { message?: string; code?: string | number; status?: string };
          message?: string; request_id?: string;
        };
        message = payload.error?.message ?? payload.message ?? message;
        code = String(payload.error?.code ?? payload.error?.status ?? 'PROVIDER_ERROR');
        requestId = payload.request_id ?? requestId;
      } catch { message = text.slice(0, 1000) || message; }
    } catch { /* The HTTP status still establishes whether this was rejected. */ }
    throw new ProviderRequestError(`${provider}: ${message}`, {
      statusCode: response.status, code, requestId,
      definiteRejection: response.status >= 400 && response.status < 500,
    });
  }
  return response;
}

export async function providerJson<T>(provider: string, response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch {
    throw new ProviderRequestError(`${provider} returned an incomplete response; the request outcome could not be confirmed`, {
      definiteRejection: false, code: 'INVALID_PROVIDER_RESPONSE',
      requestId: response.headers.get('x-request-id') ?? undefined,
    });
  }
}
