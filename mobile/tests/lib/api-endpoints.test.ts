import type { ApiClient } from '@/lib/api/client';
import { createApi, cvFormData } from '@/lib/api/endpoints';

function make() {
  const request = jest.fn().mockResolvedValue({});
  return { api: createApi(request as unknown as ApiClient), request };
}

describe('createApi (mobile)', () => {
  it('profile, analytics and job refresh', async () => {
    const { api, request } = make();
    await api.getProfile();
    expect(request).toHaveBeenLastCalledWith('/profile');
    await api.updateProfile({ location: 'Lagos' });
    expect(request).toHaveBeenLastCalledWith('/profile', { method: 'PUT', json: { location: 'Lagos' } });
    await api.getAnalytics();
    expect(request).toHaveBeenLastCalledWith('/analytics');
    await api.refreshJobs();
    expect(request).toHaveBeenLastCalledWith('/jobs/refresh', { method: 'POST' });
  });

  it('uploads the picked CV as multipart form data', async () => {
    const { api, request } = make();
    await api.uploadCv({ uri: 'file:///cache/cv.pdf', name: 'cv.pdf', mimeType: 'application/pdf' });
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe('/cv');
    expect(init.method).toBe('POST');
    expect(init.formData).toBeInstanceOf(FormData);
  });

  it('builds the form with the uri, name and type React Native needs', () => {
    const append = jest.spyOn(FormData.prototype, 'append');
    cvFormData({ uri: 'file:///cache/cv.docx', name: 'cv.docx', mimeType: 'application/msword' });
    expect(append).toHaveBeenCalledWith('file', { uri: 'file:///cache/cv.docx', name: 'cv.docx', type: 'application/msword' });
    append.mockRestore();
  });

  it('applications: list, detail, text, status, encoded ids', async () => {
    const { api, request } = make();
    await api.listApplications();
    expect(request).toHaveBeenLastCalledWith('/applications');
    await api.listApplications('applied');
    expect(request).toHaveBeenLastCalledWith('/applications?status=applied');
    await api.getApplication('a/b');
    expect(request).toHaveBeenLastCalledWith('/applications/a%2Fb');
    await api.updateApplicationText('a1', { cover_letter_text: 'Hi' });
    expect(request).toHaveBeenLastCalledWith('/applications/a1', { method: 'PATCH', json: { cover_letter_text: 'Hi' } });
    await api.setApplicationStatus('a1', 'approved');
    expect(request).toHaveBeenLastCalledWith('/applications/a1/status', { method: 'PATCH', json: { status: 'approved' } });
  });

  it('Gmail connect always names the app return target', async () => {
    const { api, request } = make();
    await api.startGmailConnect();
    expect(request).toHaveBeenLastCalledWith('/gmail/connect', { method: 'POST', json: { return: 'joblume://gmail-return' } });
    await api.getGmailStatus();
    expect(request).toHaveBeenLastCalledWith('/gmail/status');
    await api.disconnectGmail();
    expect(request).toHaveBeenLastCalledWith('/gmail', { method: 'DELETE' });
  });

  it('sending and contact emails', async () => {
    const { api, request } = make();
    await api.sendApplication('a1', { to: 'x@y.co', confirmGuess: true });
    expect(request).toHaveBeenLastCalledWith('/applications/a1/send', { method: 'POST', json: { to: 'x@y.co', confirmGuess: true } });
    await api.nextEmail('a1');
    expect(request).toHaveBeenLastCalledWith('/applications/a1/email/next', { method: 'POST' });
    await api.setEmail('a1', 'jane@acme.com');
    expect(request).toHaveBeenLastCalledWith('/applications/a1/email', { method: 'PUT', json: { email: 'jane@acme.com' } });
  });

  it('follow-ups and job links', async () => {
    const { api, request } = make();
    await api.listFollowUps('pending_review');
    expect(request).toHaveBeenLastCalledWith('/follow-ups?status=pending_review');
    await api.updateFollowUp('f1', { body: 'New body' });
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1', { method: 'PATCH', json: { body: 'New body' } });
    await api.sendFollowUp('f1');
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1/send', { method: 'POST' });
    await api.dismissFollowUp('f1');
    expect(request).toHaveBeenLastCalledWith('/follow-ups/f1/dismiss', { method: 'POST' });
    await api.addJobLink('https://www.linkedin.com/jobs/view/4012345678/');
    expect(request).toHaveBeenLastCalledWith('/jobs/from-url', { method: 'POST', json: { url: 'https://www.linkedin.com/jobs/view/4012345678/' } });
    await api.listJobFetches();
    expect(request).toHaveBeenLastCalledWith('/jobs/fetches');
  });
});
