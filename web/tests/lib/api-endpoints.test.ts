import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '@/lib/api/client';
import { createApi } from '@/lib/api/endpoints';

function make() {
  const request = vi.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('createApi', () => {
  it('getProfile / updateProfile', async () => {
    const { api, request } = make();
    await api.getProfile();
    expect(request).toHaveBeenLastCalledWith('/profile');
    await api.updateProfile({ location: 'Lagos' });
    expect(request).toHaveBeenLastCalledWith('/profile', { method: 'PUT', json: { location: 'Lagos' } });
  });

  it('uploadCv posts the file as multipart form data', async () => {
    const { api, request } = make();
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' });
    await api.uploadCv(file);
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe('/cv');
    expect(init.method).toBe('POST');
    expect((init.formData as FormData).get('file')).toBe(file);
  });

  it('listApplications with and without a status filter', async () => {
    const { api, request } = make();
    await api.listApplications();
    expect(request).toHaveBeenLastCalledWith('/applications');
    await api.listApplications('pending_review');
    expect(request).toHaveBeenLastCalledWith('/applications?status=pending_review');
  });

  it('getApplication encodes the id', async () => {
    const { api, request } = make();
    await api.getApplication('a/b');
    expect(request).toHaveBeenLastCalledWith('/applications/a%2Fb');
  });

  it('updateApplicationText patches only what it is given', async () => {
    const { api, request } = make();
    await api.updateApplicationText('abc', { cover_letter_text: 'hi' });
    expect(request).toHaveBeenLastCalledWith('/applications/abc', { method: 'PATCH', json: { cover_letter_text: 'hi' } });
  });

  it('setApplicationStatus patches /status', async () => {
    const { api, request } = make();
    await api.setApplicationStatus('abc', 'applied');
    expect(request).toHaveBeenLastCalledWith('/applications/abc/status', { method: 'PATCH', json: { status: 'applied' } });
  });

  it('getAnalytics and refreshJobs', async () => {
    const { api, request } = make();
    await api.getAnalytics();
    expect(request).toHaveBeenLastCalledWith('/analytics');
    await api.refreshJobs();
    expect(request).toHaveBeenLastCalledWith('/jobs/refresh', { method: 'POST' });
  });
});
