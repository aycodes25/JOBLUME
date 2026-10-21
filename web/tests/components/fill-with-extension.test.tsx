import type { AutofillPayload } from '@joblume/shared';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FillWithExtension } from '@/components/applications/FillWithExtension';
import type { ExtensionBridge, FillResult } from '@/lib/extension-bridge';

const payload: AutofillPayload = {
  job_url: 'https://job-boards.greenhouse.io/acme/jobs/1', full_name: 'Ada Lovelace', first_name: 'Ada', last_name: 'Lovelace', email: 'a@b.c',
  phone: null, city: null, linkedin_url: null, github_url: null, portfolio_url: null, cover_letter: 'Hello', cv: null,
};
const app = { id: 'a1', job: { title: 'Data Analyst', company: 'Acme', location: 'Lagos', source: 'myjobmag', url: 'https://example.com/job/1', company_domain: null } };

type Ping = () => Promise<boolean>;
type Fill = (p: AutofillPayload, label: { title: string; company: string }) => Promise<FillResult>;
type Load = (id: string) => Promise<AutofillPayload>;

function setup(opts: { installed?: boolean; fill?: FillResult; load?: Load } = {}) {
  let filledCb: ((n: number) => void) | undefined;
  const ping = vi.fn<Ping>().mockImplementation(async () => opts.installed ?? true);
  const fill = vi.fn<Fill>().mockImplementation(async () => opts.fill ?? { ok: true });
  const bridge: ExtensionBridge = { ping, fill, onFilled: (cb) => { filledCb = cb; return () => { filledCb = undefined; }; } };
  const loadPayload = vi.fn<Load>().mockImplementation(opts.load ?? (async () => payload));
  render(<FillWithExtension app={app} loadPayload={loadPayload} bridge={bridge} />);
  return { ping, fill, loadPayload, filled: (n: number) => act(() => filledCb?.(n)), user: userEvent.setup() };
}

describe('FillWithExtension', () => {
  it('shows the fill button when the extension answers the handshake', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Install the extension' })).toBeNull();
  });

  it('shows only a help link when the extension is not installed', async () => {
    setup({ installed: false });
    const link = await screen.findByRole('link', { name: 'Install the extension' });
    expect(link).toHaveAttribute('href', '/extension-setup.html');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing while the handshake is still pending', () => {
    const bridge: ExtensionBridge = { ping: () => new Promise<boolean>(() => undefined), fill: vi.fn(), onFilled: () => () => undefined };
    const { container } = render(<FillWithExtension app={app} loadPayload={vi.fn()} bridge={bridge} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fetches the payload, sends it with the job label, and never marks the application applied', async () => {
    const { fill, loadPayload, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    expect(loadPayload).toHaveBeenCalledWith('a1');
    expect(fill).toHaveBeenCalledWith(payload, { title: 'Data Analyst', company: 'Acme' });
    expect(await screen.findByRole('status')).toHaveTextContent('Opened the job in a new tab');
    expect(screen.queryByText(/marked as applied/i)).toBeNull();
  });

  it('shows how many fields were filled when the extension reports back', async () => {
    const { filled, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    filled(6);
    expect(await screen.findByText(/JobLume filled 6 fields/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('submit yourself');
  });

  it('explains a refusal from the extension', async () => {
    const { user } = setup({ fill: { ok: false, error: 'invalid_payload' } });
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused the data');
  });

  it('explains a failure to load the payload and sends nothing', async () => {
    const { fill, user } = setup({ load: async () => { throw new Error('boom'); } });
    await user.click(await screen.findByRole('button', { name: 'Fill the form with the JobLume extension' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(fill).not.toHaveBeenCalled();
  });
});
