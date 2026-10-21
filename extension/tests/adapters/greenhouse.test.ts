import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADAPTERS, adapterForHost } from '../../src/adapters';
import { greenhouse } from '../../src/adapters/greenhouse';
import { fillForm, formPresent } from '../../src/fill/engine';
import { allowFileAssignment, byId, cvFile, fileNames, installFakeDataTransfer, loadFixture, payload, recordEvents } from '../helpers/dom';

beforeEach(() => {
  document.body.innerHTML = loadFixture('greenhouse-form');
  allowFileAssignment(document);
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('registry', () => {
  it('maps the two Greenhouse hosts to this adapter and unknown hosts to nothing', () => {
    expect(adapterForHost('job-boards.greenhouse.io')).toBe(greenhouse);
    expect(adapterForHost('boards.greenhouse.io')).toBe(greenhouse);
    expect(adapterForHost('example.com')).toBeNull();
    expect(ADAPTERS.map((a) => a.id)).toContain('greenhouse');
  });
});

describe('Greenhouse adapter on a saved real form (job-boards.greenhouse.io/gitlab/jobs/8860302002)', () => {
  it('recognises the form', () => {
    expect(formPresent(document, greenhouse)).toBe(true);
  });

  it('fills name, email, phone, the LinkedIn question, the CV and the cover letter file', () => {
    const res = fillForm(document, greenhouse, payload(), cvFile());
    expect(byId('first_name').value).toBe('Ada');
    expect(byId('last_name').value).toBe('Lovelace');
    expect(byId('email').value).toBe('ada@example.com');
    expect(byId('phone').value).toBe('+234 801 234 5678');
    expect(byId('question_38624168002').value).toBe('https://www.linkedin.com/in/ada');
    expect(fileNames(byId('resume'))).toEqual(['Ada Lovelace CV.pdf']);
    expect(fileNames(byId('cover_letter'))).toEqual(['cover-letter.txt']);
    expect(res.slots).toEqual(['first_name', 'last_name', 'email', 'phone', 'linkedin', 'cv_file', 'cover_file']);
    expect(res.filled).toBe(7);
  });

  it('fires input, change and blur on a filled field so React registers it', () => {
    const seen = recordEvents(byId('first_name'));
    fillForm(document, greenhouse, payload(), null);
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
  });

  it('leaves custom questions, sponsorship, the country box and every self-identification field untouched', () => {
    fillForm(document, greenhouse, payload(), cvFile());
    for (const id of [
      'question_38624169002', 'question_38624171002', 'question_38624170002', 'question_38624172002', 'question_38624173002',
      'question_38624174002', 'country', 'gender', 'hispanic_ethnicity', 'veteran_status',
    ]) {
      expect(byId(id).value, id).toBe('');
    }
  });

  it('does not overwrite a value the user already typed', () => {
    byId('first_name').value = 'Grace';
    const res = fillForm(document, greenhouse, payload(), null);
    expect(byId('first_name').value).toBe('Grace');
    expect(res.slots).not.toContain('first_name');
  });

  it('uses the cover letter text box when the user has already opened it', () => {
    document.getElementById('cover_letter')!.insertAdjacentHTML('afterend', '<textarea id="cover_letter_text"></textarea>');
    const res = fillForm(document, greenhouse, payload(), null);
    expect((document.getElementById('cover_letter_text') as HTMLTextAreaElement).value).toBe('Dear team,\nI would love to join.');
    expect(res.slots).toContain('cover_text');
    expect(res.slots).not.toContain('cover_file');
  });

  it('never clicks a button or submits the form', () => {
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, greenhouse, payload(), cvFile());
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('finds nothing on a page that is not an application form', () => {
    document.body.innerHTML = '<main><h1>Open positions</h1><a href="#">Apply</a></main>';
    expect(formPresent(document, greenhouse)).toBe(false);
    expect(fillForm(document, greenhouse, payload(), cvFile())).toEqual({ filled: 0, slots: [] });
  });
});
