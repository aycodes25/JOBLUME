import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptsFile, attachFile, fillForm, fillTextControl, formPresent, setNativeValue, textValueFor,
  type Adapter, type Slot,
} from '../src/fill/engine';
import { isSensitive, labelText, normaliseLabel } from '../src/fill/labels';
import { sleep, waitFor } from '../src/fill/wait';
import { allowFileAssignment, cvFile, fileNames, installFakeDataTransfer, payload, recordEvents } from './helpers/dom';

beforeEach(() => {
  document.body.innerHTML = '';
  installFakeDataTransfer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('labels', () => {
  it('normalises stars, optional markers and spacing', () => {
    expect(normaliseLabel('  First  Name ✱ ')).toBe('first name');
    expect(normaliseLabel('Cover letter (Optional)')).toBe('cover letter');
    expect(normaliseLabel('Email*')).toBe('email');
  });

  it('reads aria-label, aria-labelledby, label[for] and a wrapping label', () => {
    document.body.innerHTML = `
      <input id="a" aria-label="Alpha">
      <span id="lb">Beta</span><input id="b" aria-labelledby="lb">
      <label for="c">Gamma</label><input id="c">
      <label>Delta <input id="d"></label>`;
    expect(labelText(document.getElementById('a')!)).toBe('alpha');
    expect(labelText(document.getElementById('b')!)).toBe('beta');
    expect(labelText(document.getElementById('c')!)).toBe('gamma');
    expect(labelText(document.getElementById('d')!)).toContain('delta');
  });

  it.each([
    'Password', 'Gender', 'What is your race?', 'Race & Ethnicity', 'Are you Hispanic/Latino?', 'Veteran Status', 'Disability status',
    'Will you require visa sponsorship?', 'Expected salary', 'Salary expectations', 'Referral source', 'How did you hear about us?',
    'Are you legally authorized to work in the US?', 'Work authorisation', 'Do you need a visa?', 'Citizenship', 'Nationality', 'Preferred pronouns',
    'Sexual orientation', 'Date of birth', 'Birth date', 'Age', 'Have you been convicted of a crime?', 'Criminal record', 'Religion', 'SSN',
    'Social Security number', 'National ID number',
  ])('treats "%s" as sensitive', (text) => {
    document.body.innerHTML = `<label for="x">${text}</label><input id="x">`;
    expect(isSensitive(document.getElementById('x')!)).toBe(true);
  });

  it('also catches a sensitive name or id when the label is missing', () => {
    document.body.innerHTML = '<input name="veteran_status"><input id="gender">';
    expect(isSensitive(document.querySelector('[name="veteran_status"]')!)).toBe(true);
    expect(isSensitive(document.getElementById('gender')!)).toBe(true);
  });

  it('does not flag words that merely contain a sensitive one', () => {
    document.body.innerHTML = '<label for="x">Message</label><input id="x"><label for="y">Your page or website</label><input id="y">';
    expect(isSensitive(document.getElementById('x')!)).toBe(false);
    expect(isSensitive(document.getElementById('y')!)).toBe(false);
  });

  it('does not flag ordinary contact fields', () => {
    document.body.innerHTML = '<label for="x">LinkedIn Profile</label><input id="x"><label for="y">Phone</label><input id="y">';
    expect(isSensitive(document.getElementById('x')!)).toBe(false);
    expect(isSensitive(document.getElementById('y')!)).toBe(false);
  });
});

describe('setNativeValue and fillTextControl', () => {
  it('sets the value through the prototype setter, bypassing a framework value tracker on the element', () => {
    const input = document.createElement('input');
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const tracked: string[] = [];
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return proto.get!.call(this); },
      set(v: string) { tracked.push(v); proto.set!.call(this, v); },
    });
    setNativeValue(input, 'Ada');
    expect(input.value).toBe('Ada');
    expect(tracked).toEqual([]);
  });

  it('works for textareas too', () => {
    const area = document.createElement('textarea');
    setNativeValue(area, 'Dear team');
    expect(area.value).toBe('Dear team');
  });

  it('fills, fires input, change, blur and focusout, and outlines the field', () => {
    document.body.innerHTML = '<input id="a" type="text">';
    const input = document.getElementById('a') as HTMLInputElement;
    const seen = recordEvents(input);
    expect(fillTextControl(input, 'Ada')).toBe(true);
    expect(input.value).toBe('Ada');
    expect(seen).toEqual(['input', 'change', 'blur', 'focusout']);
    expect(input.style.outline).toContain('solid');
  });

  it('never overwrites a value, and skips disabled, read-only, combobox and sensitive controls', () => {
    document.body.innerHTML = `
      <input id="filled" value="Grace">
      <input id="off" disabled>
      <input id="ro" readonly>
      <input id="combo" role="combobox">
      <label for="g">Gender</label><input id="g">`;
    for (const id of ['filled', 'off', 'ro', 'combo', 'g']) {
      expect(fillTextControl(document.getElementById(id) as HTMLInputElement, 'Ada')).toBe(false);
    }
    expect((document.getElementById('filled') as HTMLInputElement).value).toBe('Grace');
    expect((document.getElementById('g') as HTMLInputElement).value).toBe('');
  });
});

describe('attachFile', () => {
  it('assigns the file through DataTransfer and fires input and change', () => {
    document.body.innerHTML = '<input id="f" type="file" accept=".pdf,.docx">';
    allowFileAssignment(document);
    const input = document.getElementById('f') as HTMLInputElement;
    const seen = recordEvents(input);
    expect(attachFile(input, cvFile())).toBe(true);
    expect(fileNames(input)).toEqual(['Ada Lovelace CV.pdf']);
    expect(seen).toEqual(['input', 'change']);
  });

  it('skips an input that already has a file, is disabled, or does not accept the file type', () => {
    document.body.innerHTML = '<input id="a" type="file"><input id="b" type="file" disabled><input id="c" type="file" accept=".png,image/*">';
    allowFileAssignment(document);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => document.getElementById(id) as HTMLInputElement);
    expect(attachFile(a!, cvFile())).toBe(true);
    expect(attachFile(a!, cvFile())).toBe(false);
    expect(attachFile(b!, cvFile())).toBe(false);
    expect(attachFile(c!, cvFile())).toBe(false);
  });

  it('returns false instead of throwing when DataTransfer is unavailable', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('DataTransfer', undefined);
    document.body.innerHTML = '<input id="f" type="file">';
    expect(attachFile(document.getElementById('f') as HTMLInputElement, cvFile())).toBe(false);
  });

  it('checks accept lists by mime type, extension and wildcard', () => {
    expect(acceptsFile('', 'application/pdf', '.pdf')).toBe(true);
    expect(acceptsFile('.pdf,.doc', 'application/pdf', '.pdf')).toBe(true);
    expect(acceptsFile('application/pdf', 'application/pdf', '.pdf')).toBe(true);
    expect(acceptsFile('image/*', 'image/png', '.png')).toBe(true);
    expect(acceptsFile('image/*', 'application/pdf', '.pdf')).toBe(false);
    expect(acceptsFile('.txt', 'application/pdf', '.pdf')).toBe(false);
  });
});

describe('textValueFor', () => {
  it('maps slots to payload fields and builds a full name when only parts exist', () => {
    const p = payload();
    expect(textValueFor('linkedin', p)).toBe(p.linkedin_url);
    expect(textValueFor('cover_text', p)).toBe(p.cover_letter);
    expect(textValueFor('full_name', payload({ full_name: null }))).toBe('Ada Lovelace');
    expect(textValueFor('full_name', payload({ full_name: null, first_name: null, last_name: null }))).toBeNull();
  });
});

describe('fillForm', () => {
  const adapter: Adapter = {
    id: 'lever',
    hosts: ['example.test'],
    find: (doc: Document, slot: Slot) => doc.querySelector<HTMLElement>(`[data-slot="${slot}"]`),
  };

  it('fills text, cv and cover letter slots and counts them', () => {
    document.body.innerHTML = `
      <input data-slot="email"><input data-slot="phone"><textarea data-slot="cover_text"></textarea>
      <input data-slot="cv_file" type="file">`;
    allowFileAssignment(document);
    const res = fillForm(document, adapter, payload(), cvFile());
    expect(res.slots).toEqual(['email', 'phone', 'cover_text', 'cv_file']);
    expect(res.filled).toBe(4);
  });

  it('attaches the cover letter as cover-letter.txt when there is only a file input for it', () => {
    document.body.innerHTML = '<input data-slot="cover_file" type="file" accept=".pdf,.txt">';
    allowFileAssignment(document);
    const res = fillForm(document, adapter, payload(), null);
    expect(res.slots).toEqual(['cover_file']);
    const input = document.querySelector('input') as HTMLInputElement;
    expect(fileNames(input)).toEqual(['cover-letter.txt']);
    expect(input.files?.[0]?.type).toBe('text/plain');
  });

  it('skips slots with no value, no field, or a field of the wrong kind', () => {
    document.body.innerHTML = '<input data-slot="github" type="file"><input data-slot="city">';
    const res = fillForm(document, adapter, payload({ city: null }), null);
    expect(res).toEqual({ filled: 0, slots: [] });
  });

  it('detects a form only when a standard field exists', () => {
    expect(formPresent(document, adapter)).toBe(false);
    document.body.innerHTML = '<input data-slot="email">';
    expect(formPresent(document, adapter)).toBe(true);
  });

  it('never clicks or submits anything', () => {
    document.body.innerHTML = '<form><input data-slot="email"><button type="submit">Submit application</button></form>';
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const submit = vi.fn();
    document.querySelector('form')!.addEventListener('submit', submit);
    fillForm(document, adapter, payload(), null);
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('waitFor', () => {
  it('resolves at once when the probe already succeeds', async () => {
    expect(await waitFor(document, () => 'yes', 1000)).toBe('yes');
  });

  it('resolves when the DOM changes and the probe starts to succeed', async () => {
    const p = waitFor(document, () => (document.getElementById('late') ? true : null), 1000);
    await sleep(10);
    document.body.innerHTML = '<div id="late"></div>';
    expect(await p).toBe(true);
  });

  it('gives up with null after the time cap', async () => {
    expect(await waitFor(document, () => null, 30)).toBeNull();
  });
});
