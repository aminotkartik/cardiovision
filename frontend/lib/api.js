const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '/backend').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const { timeoutMs: _timeout, ...fetchOptions } = options;
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers: {
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const detail = body && typeof body === 'object' ? body.detail ?? body : body;
      const message = typeof detail === 'string'
        ? detail
        : detail?.message || `Request failed with status ${response.status}.`;
      throw new ApiError(message, response.status, detail);
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('The backend request timed out. Check the API service and try again.', 408);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('The backend could not be reached. Confirm that the API is running and the backend URL is configured.', 0, error.message);
  } finally {
    clearTimeout(timeoutId);
  }
}
