import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterForHost } from '../../src/adapters';
import { workable } from '../../src/adapters/workable';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byId, byName, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

beforeEach(() => {
  document.body.innerHTML = loadFixture('workable-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Workable adapter on a saved rendered form (apply.workable.com/huggingface/j/DB4D7C0EC8/apply/)', () => {
  it('is registered for apply.workable.com and recognises the form', () => {
    expect(adapterForHost('apply.workable.com')).toBe(workable);
    expect(formPresent(document, workable)).toBe(true);
  });

  it('fills first name, last name, email, the cover letter, the CV and the labelled LinkedIn and GitHub questions', () => {
    const res = fillForm(document, workable, payload(), cvFile());
    expect(byName('firstname').value).toBe('Ada');
    expect(byName('lastname').value).toBe('Lovelace');
    expect(byName('email').value).toBe('ada@example.com');
    expect(byName<HTMLTextAreaElement>('cover_letter').value).toBe('Dear team,\nI would love to join.');
    expect(byName<HTMLTextAreaElement>('CA_47383').value).toBe('https://www.linkedin.com/in/ada');
    expect(byName<HTMLTextAreaElement>('CA_47143').value).toBe('https://github.com/ada');
    expect(fileNames(document.querySelector('input[data-ui="resume"]') as HTMLInputElement)).toEqual(['Ada Lovelace CV.pdf']);
    expect(res.slots).toEqual(['first_name', 'last_name', 'email', 'linkedin', 'github', 'cover_text', 'cv_file']);
  });

  it('leaves the summary, salary, how-did-you-hear, notice period and eligibility questions untouched', () => {
    fillForm(document, workable, payload(), cvFile());
    expect(byName<HTMLTextAreaElement>('summary').value).toBe('');
    expect(byName('CA_10626').value).toBe('');
    expect(byName('CA_10629').value).toBe('');
    expect((document.getElementById('input_CA_10627_input') as HTMLInputElement).value).toBe('');
    for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))) expect(radio.checked).toBe(false);
  });

  it('fires the framework events and keeps an existing value', () => {
    byName('lastname').value = 'Byron';
    const seen = recordEvents(byName('firstname'));
    const res = fillForm(document, workable, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
    expect(byName('lastname').value).toBe('Byron');
    expect(res.slots).not.toContain('last_name');
  });

  it('never clicks the import or submit buttons', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, workable, payload(), cvFile());
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  // UNVERIFIED against a live form: the sampled posting has no phone box. These two tests only prove that the
  // documented field name and a "Phone" label are used if a posting does have one.
  it('fills input[name=phone] when a posting has one (name unverified against a live form)', () => {
    byId('email').insertAdjacentHTML('afterend', '<input name="phone" type="tel">');
    fillForm(document, workable, payload(), null);
    expect(byName('phone').value).toBe('+234 801 234 5678');
  });

  it('fills a box labelled Phone when it has no known name (unverified)', () => {
    byId('email').insertAdjacentHTML('afterend', '<label for="tel1">Phone</label><input id="tel1" type="tel" name="x1">');
    fillForm(document, workable, payload(), null);
    expect(byId('tel1').value).toBe('+234 801 234 5678');
  });
});
