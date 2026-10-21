import type { Adapter, Slot } from '../fill/engine';
import { byId, byLabel, LABEL } from './shared';

/**
 * Ashby (jobs.ashbyhq.com/<company>/<id>/application). The page is rendered by JavaScript and has no <form>.
 * Verified against the live rendered DOM (Ashby posting 7458d4e9-..., 2026-10-21) with a browser:
 * #_systemfield_name, #_systemfield_email, input#_systemfield_resume[type=file] (the first file input on the page
 * is a different "autofill from resume" upload and is deliberately not used).
 * LinkedIn is a custom field (id is a UUID) found by its label. The location field is a combobox and is never filled.
 * Not seen on this posting: a phone box (label search only) and a cover letter box (label search only).
 */
export const ashby: Adapter = {
  id: 'ashby',
  hosts: ['jobs.ashbyhq.com'],
  find(doc: Document, slot: Slot): HTMLElement | null {
    switch (slot) {
      case 'full_name':
        return byId(doc, '_systemfield_name');
      case 'email':
        return byId(doc, '_systemfield_email');
      case 'cv_file':
        return doc.querySelector<HTMLInputElement>('input#_systemfield_resume[type="file"]');
      case 'phone':
        return byLabel(doc, LABEL.phone);
      case 'city':
        return byLabel(doc, LABEL.city);
      case 'linkedin':
        return byLabel(doc, LABEL.linkedin);
      case 'github':
        return byLabel(doc, LABEL.github);
      case 'portfolio':
        return byLabel(doc, LABEL.portfolio);
      case 'cover_text':
        return byLabel(doc, LABEL.cover, 'textarea');
      case 'first_name':
      case 'last_name':
      case 'cover_file':
        return null;
    }
  },
};
