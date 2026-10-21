import type { AutofillPayload } from '@joblume/shared';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/** Saved real application form HTML (see tests/fixtures). */
export function loadFixture(name: 'greenhouse-form' | 'lever-form' | 'ashby-form' | 'workable-form'): string {
  return readFileSync(resolve(here, '../fixtures', `${name}.html`), 'utf8');
}

export function payload(over: Partial<AutofillPayload> = {}): AutofillPayload {
  return {
    job_url: 'https://job-boards.greenhouse.io/gitlab/jobs/8860302002',
    full_name: 'Ada Lovelace',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '+234 801 234 5678',
    city: 'Lagos',
    linkedin_url: 'https://www.linkedin.com/in/ada',
    github_url: 'https://github.com/ada',
    portfolio_url: 'https://ada.dev/',
    cover_letter: 'Dear team,\nI would love to join.',
    cv: { url: 'https://abcd1234.supabase.co/storage/v1/object/sign/cvs/u1/tailored/j1.pdf?token=t', filename: 'Ada Lovelace CV.pdf' },
    ...over,
  };
}

export const cvFile = () => new File(['%PDF-1.4 test'], 'Ada Lovelace CV.pdf', { type: 'application/pdf' });

/** jsdom has no DataTransfer; this stands in for it. `files` is a plain array of the added files. */
export class FakeDataTransfer {
  private list: File[] = [];
  items = {
    add: (file: File) => {
      this.list.push(file);
    },
  };
  get files(): File[] {
    return this.list;
  }
}

export function installFakeDataTransfer(): void {
  vi.stubGlobal('DataTransfer', FakeDataTransfer);
}

/** jsdom only lets a real FileList be assigned to input.files; make it a plain writable property instead. */
export function allowFileAssignment(root: ParentNode): void {
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: [] });
  }
}

export function recordEvents(el: Element, types = ['input', 'change', 'blur', 'focusout', 'click', 'submit']): string[] {
  const seen: string[] = [];
  for (const t of types) el.addEventListener(t, () => seen.push(t));
  return seen;
}

export const fileNames = (input: HTMLInputElement): string[] => Array.from(input.files ?? []).map((f) => f.name);

export function byId<T extends HTMLElement = HTMLInputElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found in the fixture`);
  return el as T;
}

export function byName<T extends HTMLElement = HTMLInputElement>(name: string): T {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) throw new Error(`[name="${name}"] not found in the fixture`);
  return el as T;
}
