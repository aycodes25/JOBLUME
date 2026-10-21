/** Lower-case, no required-field stars, no "(optional)", single spaces. */
export function normaliseLabel(s: string): string {
  return s
    .replace(/[*✱]/g, ' ')
    .replace(/\(optional\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The human label of a form control: aria-label, aria-labelledby targets, label[for] and a wrapping label. */
export function labelText(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  const aria = el.getAttribute('aria-label');
  if (aria) parts.push(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    for (const id of by.split(/\s+/)) {
      const text = id ? doc.getElementById(id)?.textContent : null;
      if (text) parts.push(text);
    }
  }
  if (el.id) {
    for (const label of Array.from(doc.querySelectorAll('label'))) {
      if (label.htmlFor === el.id) parts.push(label.textContent ?? '');
    }
  }
  const wrapping = el.closest('label');
  if (wrapping) parts.push(wrapping.textContent ?? '');
  return normaliseLabel(parts.join(' '));
}

/** Questions the extension must never answer, whatever field they sit in. */
const SENSITIVE =
  /password|gender|\brace\b|racial|ethnic|veteran|disabilit|sponsor|salary|compensation|referr|hear about|hispanic|latino|\bvisa\b|work authori[sz]ation|authori[sz]ed to work|citizenship|nationality|pronoun|sexual orientation|date of birth|birth date|\bage\b|criminal|convict|religio|\bssn\b|social security|national id/;

/** Label plus name and id, so a control with a telling name but no label is still caught. */
export function isSensitive(el: Element): boolean {
  const name = el.getAttribute('name') ?? '';
  return SENSITIVE.test(`${labelText(el)} ${name.toLowerCase()} ${el.id.toLowerCase()}`);
}
