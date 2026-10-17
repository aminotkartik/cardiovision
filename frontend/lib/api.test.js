import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('relative backend API client', () => {
  it('uses the same-origin backend proxy and parses a successful JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ inference_available: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await apiRequest('/health');
    expect(fetchMock.mock.calls[0][0]).toBe('/backend/health');
    expect(response.inference_available).toBe(false);
  });

  it('returns a meaningful API error for unavailable model artifacts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'application/json' },
      json: async () => ({ detail: { message: 'Real inference is unavailable.', missing_artifacts: ['pipeline_cad.joblib'] } }),
    }));
    await expect(apiRequest('/api/predict', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      name: 'ApiError', status: 503, message: 'Real inference is unavailable.',
    });
  });

  it('turns network failures into an actionable user-facing error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    try {
      await apiRequest('/api/schema');
      throw new Error('expected API request to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(0);
      expect(error.message).toContain('backend could not be reached');
    }
  });
});
