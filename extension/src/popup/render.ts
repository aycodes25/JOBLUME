import type { StatusReply } from '../messages';

export interface PopupActions {
  onClear(): void;
  docsUrl: string;
}

export function describeStatus(status: StatusReply, now: number): string {
  if (!status.armed) return 'Nothing is waiting to be filled in this tab.';
  const { title, company } = status.label ?? { title: '', company: '' };
  const job = title && company ? `${title} at ${company}` : title || company || 'a job from JobLume';
  const minutes = Math.max(1, Math.ceil(((status.expiresAt ?? now) - now) / 60_000));
  return `Ready to fill: ${job}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/** Draws the popup. Everything is set through textContent, never innerHTML. */
export function renderPopup(root: HTMLElement, status: StatusReply, now: number, actions: PopupActions): void {
  const doc = root.ownerDocument;
  root.replaceChildren();

  const heading = doc.createElement('h1');
  heading.textContent = 'JobLume Autofill';

  const text = doc.createElement('p');
  text.id = 'status';
  text.textContent = describeStatus(status, now);

  const note = doc.createElement('p');
  note.textContent = 'The extension fills standard fields only. You review everything and press Submit yourself.';

  root.append(heading, text, note);

  if (status.armed) {
    const clear = doc.createElement('button');
    clear.type = 'button';
    clear.id = 'clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', actions.onClear);
    root.append(clear);
  }

  const help = doc.createElement('a');
  help.id = 'help';
  help.href = actions.docsUrl;
  help.target = '_blank';
  help.rel = 'noopener noreferrer';
  help.textContent = 'Setup help';
  root.append(help);
}
