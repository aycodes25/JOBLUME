import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeStatus, renderPopup } from '../src/popup/render';
import { BANNER_ID, bannerText, showBanner } from '../src/ui/banner';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('banner', () => {
  it('says how many fields were filled and tells the user to review and submit themselves', () => {
    expect(bannerText(1)).toBe('JobLume filled 1 field. Review every answer, then submit yourself.');
    expect(bannerText(7)).toBe('JobLume filled 7 fields. Review every answer, then submit yourself.');
  });

  it('is dismissible, shown once, and set as text', () => {
    showBanner(document, 2);
    const box = showBanner(document, 3);
    expect(document.querySelectorAll(`#${BANNER_ID}`)).toHaveLength(1);
    expect(box.textContent).toContain('JobLume filled 3 fields.');
    expect(box.querySelector('img, script')).toBeNull();
    (box.querySelector('button') as HTMLButtonElement).click();
    expect(document.getElementById(BANNER_ID)).toBeNull();
  });
});

describe('popup', () => {
  const none = { armed: false, label: null, expiresAt: null };
  const actions = () => ({ onClear: vi.fn(), docsUrl: 'http://localhost:3000/extension-setup.html' });

  it('describes an empty tab, a labelled job and an unlabelled job', () => {
    expect(describeStatus(none, 0)).toBe('Nothing is waiting to be filled in this tab.');
    expect(describeStatus({ armed: true, label: { title: 'Data Analyst', company: 'Acme' }, expiresAt: 10 * 60_000 }, 0)).toBe(
      'Ready to fill: Data Analyst at Acme. It expires in 10 minutes.',
    );
    expect(describeStatus({ armed: true, label: null, expiresAt: 30_000 }, 0)).toBe('Ready to fill: a job from JobLume. It expires in 1 minute.');
  });

  it('shows a Clear button only while something is armed, and calls the handler', () => {
    const root = document.createElement('main');
    document.body.append(root);
    const a = actions();
    renderPopup(root, none, 0, a);
    expect(root.querySelector('#clear')).toBeNull();

    renderPopup(root, { armed: true, label: { title: 'T', company: 'C' }, expiresAt: 60_000 }, 0, a);
    (root.querySelector('#clear') as HTMLButtonElement).click();
    expect(a.onClear).toHaveBeenCalledTimes(1);
  });

  it('links to the setup help safely and never renders markup from the job label', () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderPopup(root, { armed: true, label: { title: '<img src=x onerror=alert(1)>', company: 'Acme' }, expiresAt: 60_000 }, 0, actions());
    const help = root.querySelector('#help') as HTMLAnchorElement;
    expect(help.href).toBe('http://localhost:3000/extension-setup.html');
    expect(help.rel).toBe('noopener noreferrer');
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
