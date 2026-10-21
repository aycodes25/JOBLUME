import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapterForHost } from '../../src/adapters';
import { ashby } from '../../src/adapters/ashby';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byId, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

const LINKEDIN_ID = '2f73c135-4c72-40cf-84bc-ba7700192f2f';

beforeEach(() => {
  // The real page has an unlabelled "autofill from resume" file input before the form fields.
  document.body.innerHTML = `<input type="file" id="autofill-decoy">${loadFixture('ashby-form')}`;
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Ashby adapter on a saved rendered form (jobs.ashbyhq.com/ashby/7458d4e9-.../application)', () => {
  it('is registered for jobs.ashbyhq.com and recognises the form without a <form> element', () => {
    expect(adapterForHost('jobs.ashbyhq.com')).toBe(ashby);
    expect(document.querySelector('form')).toBeNull();
    expect(formPresent(document, ashby)).toBe(true);
  });

  it('fills name, email, the LinkedIn custom field and attaches the CV to the resume field, not the decoy', () => {
    const res = fillForm(document, ashby, payload(), cvFile());
    expect(byId('_systemfield_name').value).toBe('Ada Lovelace');
    expect(byId('_systemfield_email').value).toBe('ada@example.com');
    expect(byId(LINKEDIN_ID).value).toBe('https://www.linkedin.com/in/ada');
    expect(fileNames(byId('_systemfield_resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(fileNames(byId('autofill-decoy'))).toEqual([]);
    expect(res.slots).toEqual(['full_name', 'email', 'linkedin', 'cv_file']);
  });

  it('leaves the location combobox, the time-zone question, sponsorship and the long essay answers untouched', () => {
    fillForm(document, ashby, payload(), cvFile());
    expect((document.querySelector('[role="combobox"]') as HTMLInputElement).value).toBe('');
    expect(byId('c96f681c-a8cf-4bf2-b6cf-fc08420a01d8').value).toBe('');
    expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    for (const area of Array.from(document.querySelectorAll('textarea'))) expect(area.value).toBe('');
  });

  it('fires the framework events and keeps an existing value', () => {
    byId('_systemfield_email').value = 'keep@example.com';
    const seen = recordEvents(byId('_systemfield_name'));
    const res = fillForm(document, ashby, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
    expect(byId('_systemfield_email').value).toBe('keep@example.com');
    expect(res.slots).not.toContain('email');
  });

  it('never clicks the Upload button or submits', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    fillForm(document, ashby, payload(), cvFile());
    expect(click).not.toHaveBeenCalled();
  });

  it('finds nothing on the job description page before the application tab is opened', () => {
    document.body.innerHTML = '<h1>Engineering Manager - EU</h1><button>Apply for this Job</button>';
    expect(formPresent(document, ashby)).toBe(false);
  });
});
