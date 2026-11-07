import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminFetch, getAdminInfo } from './client';

const API_BASE = '/api/admin';

function mockFetch(response: Partial<Response>): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue({ data: 'ok' }),
    text: vi.fn().mockResolvedValue(''),
    ...response,
  } as Response);
}

describe('adminFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('auth validation', () => {
    it('throws if token is undefined', async () => {
      await expect(adminFetch('/test', undefined)).rejects.toThrow(
        'Admin token is not set',
      );
    });

    it('throws if token is empty string', async () => {
      await expect(adminFetch('/test', '')).rejects.toThrow(
        'Admin token is not set',
      );
    });
  });

  describe('requests', () => {
    it('sends bearer token and JSON content type to /api/admin', async () => {
      mockFetch({});
      await adminFetch('/channels', 'token');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${API_BASE}/channels`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('returns parsed JSON', async () => {
      mockFetch({ json: vi.fn().mockResolvedValue([{ id: 'bears' }]) });
      await expect(adminFetch('/channels', 'token')).resolves.toEqual([{ id: 'bears' }]);
    });

    it('forwards method and body options', async () => {
      mockFetch({});
      await adminFetch('/channels/bears', 'token', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'x' }),
      });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${API_BASE}/channels/bears`,
        expect.objectContaining({ method: 'PATCH', body: '{"name":"x"}' }),
      );
    });
  });

  describe('error handling', () => {
    it('throws the server message on non-ok responses', async () => {
      mockFetch({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('{"message":"bad days"}'),
      });
      await expect(adminFetch('/schedules/1', 'token', { method: 'PATCH' })).rejects.toThrow('bad days');
    });

    it('falls back to raw text for non-JSON error bodies', async () => {
      mockFetch({ ok: false, status: 500, text: vi.fn().mockResolvedValue('boom') });
      await expect(adminFetch('/info', 'token')).rejects.toThrow('boom');
    });

    it('throws on non-JSON success responses', async () => {
      mockFetch({
        headers: new Headers({ 'content-type': 'text/html' }),
        text: vi.fn().mockResolvedValue('<html>nope</html>'),
      });
      await expect(adminFetch('/channels', 'token')).rejects.toThrow('Expected JSON response');
    });

    it('returns undefined for 204s', async () => {
      mockFetch({ status: 204 });
      await expect(adminFetch('/channels/1', 'token', { method: 'DELETE' })).resolves.toBeUndefined();
    });
  });
});

describe('getAdminInfo', () => {
  it('hits /info with the token', async () => {
    mockFetch({ json: vi.fn().mockResolvedValue({ version: '1.0.0' }) });
    await expect(getAdminInfo('token')).resolves.toEqual({ version: '1.0.0' });
    expect(globalThis.fetch).toHaveBeenCalledWith(`${API_BASE}/info`, expect.anything());
  });
});
