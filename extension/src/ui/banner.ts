export const BANNER_ID = 'joblume-autofill-banner';

export function bannerText(count: number): string {
  return `JobLume filled ${count} field${count === 1 ? '' : 's'}. Review every answer, then submit yourself.`;
}

/** A small dismissible notice in the top right corner. Text only, never HTML. */
export function showBanner(doc: Document, count: number): HTMLElement {
  doc.getElementById(BANNER_ID)?.remove();
  const box = doc.createElement('div');
  box.id = BANNER_ID;
  box.setAttribute('role', 'status');
  Object.assign(box.style, {
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: '2147483647',
    maxWidth: '320px',
    padding: '10px 12px',
    background: '#eff6ff',
    color: '#1e3a8a',
    border: '1px solid #93c5fd',
    borderRadius: '8px',
    font: '14px/1.4 system-ui, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-start',
  });
  const text = doc.createElement('span');
  text.textContent = bannerText(count);
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss JobLume message');
  Object.assign(close.style, { border: '0', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: '1' });
  close.addEventListener('click', () => box.remove());
  box.append(text, close);
  (doc.body ?? doc.documentElement).append(box);
  return box;
}
