import { isSensitive, labelText } from '../fill/labels';

/** Text-like controls only: never files, checkboxes, radios, hidden fields, buttons or comboboxes. */
const CANDIDATES = 'textarea, input:not([type]), input[type="text"], input[type="url"], input[type="tel"], input[type="search"]';

/** Label patterns for the fallback search (matched against the lower-case label text). */
export const LABEL = {
  phone: /\b(phone|mobile|telephone)\b/,
  city: /^(current |your |preferred )?(city|location)( \(city\))?$/,
  linkedin: /linkedin/,
  github: /github/,
  portfolio: /\b(portfolio|personal (web)?site|website)\b/,
  cover: /cover letter/,
} as const;

/**
 * The first plain text control whose label matches. Sensitive questions and comboboxes are never returned,
 * so a custom question can only be matched by an explicit standard label such as "LinkedIn Profile".
 */
export function byLabel(doc: Document, pattern: RegExp, tag?: 'textarea'): HTMLInputElement | HTMLTextAreaElement | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(tag ?? CANDIDATES))) {
    if (el.getAttribute('role') === 'combobox' || el.disabled) continue;
    if (isSensitive(el)) continue;
    if (pattern.test(labelText(el))) return el;
  }
  return null;
}

export function byId<T extends HTMLElement = HTMLInputElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}
