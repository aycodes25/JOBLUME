import type { Adapter, Slot } from '../fill/engine';
import { byLabel, LABEL } from './shared';

/** The input inside "Links" whose name is urls[<key>], comparing keys without case; first key in the list wins. */
function linkInput(doc: Document, keys: string[]): HTMLInputElement | null {
  const inputs = Array.from(doc.querySelectorAll<HTMLInputElement>('input[name^="urls["]'));
  for (const key of keys) {
    const hit = inputs.find((i) => i.name.slice(5, -1).trim().toLowerCase() === key);
    if (hit) return hit;
  }
  return null;
}

/**
 * Lever (jobs.lever.co/<company>/<id>/apply).
 * Verified against two live server-rendered forms (Spotify 223f9722-..., Lever demo ad208490-..., 2026-10-21):
 * input[name=name] (one full-name box), input[name=email], input[name=phone], input[name=location],
 * input[name="urls[LinkedIn]"], urls[GitHub] or urls[Github], urls[Portfolio] or urls[Other Website] or urls[Other],
 * and input[type=file][name=resume].
 * NOT seen on either form: a cover letter box. It is only filled when a text area is labelled "cover letter".
 * The location box shows suggestions; the user may need to pick one.
 */
export const lever: Adapter = {
  id: 'lever',
  hosts: ['jobs.lever.co'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'full_name':
        return doc.querySelector<HTMLInputElement>('input[name="name"]');
      case 'email':
        return doc.querySelector<HTMLInputElement>('input[name="email"]');
      case 'phone':
        return doc.querySelector<HTMLInputElement>('input[name="phone"]');
      case 'city':
        return doc.querySelector<HTMLInputElement>('input[name="location"]');
      case 'linkedin':
        return linkInput(doc, ['linkedin']) ?? byLabel(doc, LABEL.linkedin);
      case 'github':
        return linkInput(doc, ['github']) ?? byLabel(doc, LABEL.github);
      case 'portfolio':
        return linkInput(doc, ['portfolio', 'other website', 'website', 'other']);
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input[type="file"][name="resume"]');
      case 'cover_text':
        return byLabel(doc, LABEL.cover, 'textarea');
      case 'first_name':
      case 'last_name':
      case 'cover_file':
        return null;
    }
  },
};
