import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient } from '@/lib/api/client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function make(over: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  const fetchImpl = vi.fn();
  const onUnauthorized = vi.fn();
  const request = createApiClient({
    baseUrl: 'http://api.test',
    getToken: async () => 'tok',
    onUnauthorized,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...over,
  });
  return { request, fetchImpl, onUnauthorized };
}

describe('createApiClient', () => {
  it('sends the bearer token and returns parsed JSON', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ a: 1 }));
    expect(await request('/x')).toEqual({ a: 1 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('http://api.test/x');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('sends a JSON body with a content-type header', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ ok: true }));
    await request('/p', { method: 'PUT', json: { a: 1 } });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('sends FormData without setting a content-type header', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ characters: 10 }));
    const form = new FormData();
    form.append('file', new Blob(['x']), 'cv.pdf');
    await request('/cv', { method: 'POST', formData: form });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('calls onUnauthorized and throws a 401 error when the server answers 401', async () => {
    const { request, fetchImpl, onUnauthorized } = make();
    fetchImpl.mockResolvedValue(json({ error: 'unauthorized' }, 401));
    await expect(request('/x')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not call the server when there is no token', async () => {
    const { request, fetchImpl, onUnauthorized } = make({ getToken: async () => null });
    await expect(request('/x')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps an error body to an ApiRequestError with code, message and details', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(json({ error: 'invalid_request', message: 'bad', details: { fieldErrors: { a: ['x'] } } }, 400));
    const err = await request('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({ status: 400, code: 'invalid_request', message: 'bad', details: { fieldErrors: { a: ['x'] } } });
  });

  it('turns a network failure into a status 0 network_error', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/x')).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('returns null for an empty successful body', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(new Response('', { status: 200 }));
    expect(await request('/x')).toBeNull();
  });

  it('uses http_error as the code when the error body is not JSON', async () => {
    const { request, fetchImpl } = make();
    fetchImpl.mockResolvedValue(new Response('<html>oops</html>', { status: 502 }));
    await expect(request('/x')).rejects.toMatchObject({ status: 502, code: 'http_error' });
  });
});
