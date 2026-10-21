import type { Adapter, Slot } from '../fill/engine';
import { byId, byLabel, LABEL } from './shared';

/**
 * Greenhouse (job-boards.greenhouse.io; boards.greenhouse.io redirects there).
 * Verified against a live server-rendered form (GitLab posting 8860302002, 2026-10-21):
 * stable ids first_name, last_name, email, phone, resume (file), cover_letter (file).
 * LinkedIn and website questions are custom questions with ids like question_38624168002, found by their label.
 * #cover_letter_text is the target of the label "Enter manually"; the textarea only exists after the user clicks it.
 */
export const greenhouse: Adapter = {
  id: 'greenhouse',
  hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'first_name':
        return byId(doc, 'first_name');
      case 'last_name':
        return byId(doc, 'last_name');
      case 'email':
        return byId(doc, 'email');
      case 'phone':
        return byId(doc, 'phone') ?? byLabel(doc, LABEL.phone);
      case 'city':
        return byLabel(doc, LABEL.city);
      case 'linkedin':
        return byLabel(doc, LABEL.linkedin);
      case 'github':
        return byLabel(doc, LABEL.github);
      case 'portfolio':
        return byLabel(doc, LABEL.portfolio);
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input#resume[type="file"]');
      case 'cover_file':
        return doc.querySelector<HTMLInputElement>('input#cover_letter[type="file"]');
      case 'cover_text':
        return byId<HTMLTextAreaElement>(doc, 'cover_letter_text');
      case 'full_name':
        return null;
    }
  },
};
