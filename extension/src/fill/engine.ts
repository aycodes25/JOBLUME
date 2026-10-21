import type { AutofillPayload } from '@joblume/shared';
import { isSensitive } from './labels';

export type TextSlot =
  | 'full_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'city'
  | 'linkedin' | 'github' | 'portfolio' | 'cover_text';
export type FileSlot = 'cv_file' | 'cover_file';
export type Slot = TextSlot | FileSlot;

export const TEXT_SLOTS: readonly TextSlot[] = [
  'full_name', 'first_name', 'last_name', 'email', 'phone', 'city', 'linkedin', 'github', 'portfolio', 'cover_text',
];

/** One employer platform: which hosts it owns and how to find each standard field on its form. */
export interface Adapter {
  id: 'greenhouse' | 'lever' | 'ashby' | 'workable';
  hosts: readonly string[];
  find(doc: Document, slot: Slot): HTMLElement | null;
}

export interface FillResult {
  filled: number;
  slots: Slot[];
}

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'search']);
export const OUTLINE = '2px solid #93c5fd';

export function isTextControl(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
}

export function isFileControl(el: Element | null): el is HTMLInputElement {
  return el?.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file';
}

/** Sets .value through the prototype setter so React and Vue notice the change. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export function fireFieldEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur'));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/** Fills one text control. Skips disabled, read-only, combobox, sensitive and already-filled controls. */
export function fillTextControl(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (value === '' || el.disabled || el.readOnly) return false;
  if (el.getAttribute('role') === 'combobox') return false;
  if (el.value.trim() !== '') return false;
  if (isSensitive(el)) return false;
  setNativeValue(el, value);
  fireFieldEvents(el);
  el.style.outline = OUTLINE;
  el.style.outlineOffset = '1px';
  return true;
}

/** True when the input's accept list (empty means anything) allows this kind of file. */
export function acceptsFile(accept: string, mime: string, ext: string): boolean {
  const list = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return true;
  return list.some((a) => a === mime || a === ext || (a.endsWith('/*') && mime.startsWith(a.slice(0, -1))));
}

/** Gives a file input a file the way a user pick would: DataTransfer, then input and change events. */
export function attachFile(input: HTMLInputElement, file: File): boolean {
  if (input.disabled || (input.files?.length ?? 0) > 0) return false;
  if (isSensitive(input)) return false;
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!acceptsFile(input.accept, file.type, ext)) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch {
    return false;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function textValueFor(slot: TextSlot, p: AutofillPayload): string | null {
  switch (slot) {
    case 'full_name':
      return p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || null);
    case 'first_name':
      return p.first_name;
    case 'last_name':
      return p.last_name;
    case 'email':
      return p.email;
    case 'phone':
      return p.phone;
    case 'city':
      return p.city;
    case 'linkedin':
      return p.linkedin_url;
    case 'github':
      return p.github_url;
    case 'portfolio':
      return p.portfolio_url;
    case 'cover_text':
      return p.cover_letter;
  }
}

/** True once the page shows at least one field this adapter can fill. */
export function formPresent(doc: Document, adapter: Adapter): boolean {
  return (['email', 'full_name', 'first_name', 'cv_file'] as const).some((s) => adapter.find(doc, s) !== null);
}

/**
 * Fills every standard field the adapter finds. Never clicks, never submits, never overwrites.
 * `cv` is the already-downloaded CV file (null when there is none).
 */
export function fillForm(doc: Document, adapter: Adapter, payload: AutofillPayload, cv: File | null): FillResult {
  const slots: Slot[] = [];

  for (const slot of TEXT_SLOTS) {
    const value = textValueFor(slot, payload);
    if (!value) continue;
    const el = adapter.find(doc, slot);
    if (isTextControl(el) && fillTextControl(el, value)) slots.push(slot);
  }

  if (cv) {
    const input = adapter.find(doc, 'cv_file');
    if (isFileControl(input) && attachFile(input, cv)) slots.push('cv_file');
  }

  // A cover letter goes into a text box when the form has one; otherwise into a file input as a .txt file.
  if (payload.cover_letter && !slots.includes('cover_text')) {
    const input = adapter.find(doc, 'cover_file');
    if (isFileControl(input)) {
      const file = new File([payload.cover_letter], 'cover-letter.txt', { type: 'text/plain' });
      if (attachFile(input, file)) slots.push('cover_file');
    }
  }

  return { filled: slots.length, slots };
}
