import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterForHost } from '../../src/adapters';
import { lever } from '../../src/adapters/lever';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byName, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

beforeEach(() => {
  document.body.innerHTML = loadFixture('lever-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Lever adapter on a saved real form (jobs.lever.co/spotify/223f9722-.../apply)', () => {
  it('is registered for jobs.lever.co and recognises the form', () => {
    expect(adapterForHost('jobs.lever.co')).toBe(lever);
    expect(formPresent(document, lever)).toBe(true);
  });

  it('fills the single full-name box, email, phone, location, the three links and the CV', () => {
    const res = fillForm(document, lever, payload(), cvFile());
    expect(byName('name').value).toBe('Ada Lovelace');
    expect(byName('email').value).toBe('ada@example.com');
    expect(byName('phone').value).toBe('+234 801 234 5678');
    expect(byName('location').value).toBe('Lagos');
    expect(byName('urls[LinkedIn]').value).toBe('https://www.linkedin.com/in/ada');
    expect(byName('urls[GitHub]').value).toBe('https://github.com/ada');
    expect(byName('urls[Portfolio]').value).toBe('https://ada.dev/');
    expect(fileNames(byName('resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(res.slots).toEqual(['full_name', 'email', 'phone', 'city', 'linkedin', 'github', 'portfolio', 'cv_file']);
  });

  it('leaves the current company, the other-website box, checkboxes and demographic answers alone', () => {
    fillForm(document, lever, payload(), cvFile());
    expect(byName('org').value).toBe('');
    expect(byName('urls[Other]').value).toBe('');
    for (const box of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'))) {
      expect(box.checked).toBe(false);
    }
  });

  it('matches link boxes without regard to case and falls back to other website names', () => {
    document.body.innerHTML = `
      <input name="urls[Github]"><input name="urls[Other Website]"><input name="urls[Video Link ]">`;
    fillForm(document, lever, payload(), null);
    expect(byName('urls[Github]').value).toBe('https://github.com/ada');
    expect(byName('urls[Other Website]').value).toBe('https://ada.dev/');
    expect(byName('urls[Video Link ]').value).toBe('');
  });

  it('fires the framework events on filled fields', () => {
    const seen = recordEvents(byName('email'));
    fillForm(document, lever, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
  });

  it('does not touch an existing value and never submits', () => {
    byName('phone').value = '0800 000 0000';
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, lever, payload(), null);
    expect(byName('phone').value).toBe('0800 000 0000');
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('fills a text area only when it is labelled as a cover letter', () => {
    document.body.innerHTML = `
      <label>Cover letter <textarea name="comments"></textarea></label>
      <label>Anything else? <textarea name="other"></textarea></label>`;
    const res = fillForm(document, lever, payload(), null);
    expect(byName<HTMLTextAreaElement>('comments').value).toBe('Dear team,\nI would love to join.');
    expect(byName<HTMLTextAreaElement>('other').value).toBe('');
    expect(res.slots).toEqual(['cover_text']);
  });
});
