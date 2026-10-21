import type { Adapter, Slot } from '../fill/engine';
import { byLabel, LABEL } from './shared';

/**
 * Workable (apply.workable.com/<company>/j/<shortcode>/apply/). Rendered by JavaScript.
 * Verified against the live rendered DOM (Hugging Face DB4D7C0EC8, 2026-10-21) with a browser:
 * form[data-ui=application-form], input[name=firstname], input[name=lastname], input[name=email],
 * input[type=file][data-ui=resume], textarea[name=cover_letter].
 * LinkedIn and GitHub are custom questions (names like CA_47383, textareas) found by their label.
 * UNVERIFIED against a live form: input[name=phone] (this posting has no phone box; the name is the documented
 * Workable candidate field key) and the city/location label search.
 */
export const workable: Adapter = {
  id: 'workable',
  hosts: ['apply.workable.com'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'first_name':
        return doc.querySelector<HTMLInputElement>('input[name="firstname"]');
      case 'last_name':
        return doc.querySelector<HTMLInputElement>('input[name="lastname"]');
      case 'email':
        return doc.querySelector<HTMLInputElement>('input[name="email"]');
      case 'phone':
        return doc.querySelector<HTMLInputElement>('input[name="phone"]') ?? byLabel(doc, LABEL.phone);
      case 'city':
        return byLabel(doc, LABEL.city);
      case 'linkedin':
        return byLabel(doc, LABEL.linkedin);
      case 'github':
        return byLabel(doc, LABEL.github);
      case 'portfolio':
        return byLabel(doc, LABEL.portfolio);
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input[type="file"][data-ui="resume"]');
      case 'cover_text':
        return doc.querySelector<HTMLTextAreaElement>('textarea[name="cover_letter"]');
      case 'full_name':
      case 'cover_file':
        return null;
    }
  },
};
