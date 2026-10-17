import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface CvSection {
  heading: string | null;
  lines: string[];
}

const HEADING = /^(professional summary|summary|profile|key skills|skills|work experience|professional experience|experience|education|certifications|projects)\s*:?$/i;

/** Standard PDF fonts only encode WinAnsi; map common glyphs and drop the rest. */
export function sanitize(text: string): string {
  return text
    .replace(/₦/g, 'N')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF•]/g, '');
}

export function parseSections(text: string): CvSection[] {
  const sections: CvSection[] = [{ heading: null, lines: [] }];
  for (const raw of sanitize(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (HEADING.test(line.trim())) {
      sections.push({ heading: line.trim().replace(/:$/, '').toUpperCase(), lines: [] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }
  return sections.filter((s) => s.heading !== null || s.lines.some((l) => l.trim() !== ''));
}

export function wrapText(text: string, measure: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  const push = () => {
    if (current) lines.push(current);
    current = '';
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (measure(w) > maxWidth) {
      let cut = w.length - 1;
      while (cut > 1 && measure(w.slice(0, cut)) > maxWidth) cut--;
      push();
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const candidate = current ? `${current} ${w}` : w;
    if (measure(candidate) <= maxWidth) current = candidate;
    else {
      push();
      current = w;
    }
  }
  push();
  return lines;
}

export async function renderCvPdf(text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28;
  const H = 841.89;
  const M = 50;
  const contentW = W - 2 * M;
  const ink = rgb(0.1, 0.1, 0.1);
  const accent = rgb(0.42, 0.36, 0.91);

  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };
  const draw = (t: string, o: { font?: typeof regular; size?: number; x?: number; color?: ReturnType<typeof rgb>; lead?: number } = {}) => {
    const size = o.size ?? 10;
    const lead = o.lead ?? size * 1.4;
    ensure(lead);
    y -= lead;
    page.drawText(t, { x: o.x ?? M, y, size, font: o.font ?? regular, color: o.color ?? ink });
  };

  for (const section of parseSections(text)) {
    if (section.heading) {
      y -= 8;
      ensure(28);
      draw(section.heading, { font: bold, size: 11, color: accent });
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
      y -= 4;
    }
    let first = true;
    for (const raw of section.lines) {
      const line = raw.trim();
      if (!line) {
        y -= 4;
        continue;
      }
      if (!section.heading && first) {
        first = false;
        for (const l of wrapText(line, (s) => bold.widthOfTextAtSize(s, 16), contentW)) draw(l, { font: bold, size: 16, lead: 20 });
        continue;
      }
      first = false;
      const bullet = /^[-•]\s+/.test(line);
      const body = bullet ? line.replace(/^[-•]\s+/, '') : line;
      const indent = bullet ? 14 : 0;
      wrapText(body, (s) => regular.widthOfTextAtSize(s, 10), contentW - indent).forEach((l, i) => {
        if (bullet && i === 0) {
          ensure(14);
          page.drawText('•', { x: M + 3, y: y - 14, size: 10, font: regular, color: ink });
        }
        draw(l, { x: M + indent });
      });
    }
  }
  return pdf.save();
}
