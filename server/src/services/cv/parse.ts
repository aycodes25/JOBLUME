import mammoth from 'mammoth';
// Import the inner module: pdf-parse's index.js runs a debug routine that reads a missing test file under ESM.
// pdf.js misparses some Node Buffers (works or fails depending on how the Buffer was allocated), so always hand it a plain Uint8Array copy.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export type CvFileType = 'pdf' | 'docx';

export function detectCvType(buf: Buffer): CvFileType | null {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  return null;
}

export async function extractCvText(buf: Buffer, type: CvFileType): Promise<string> {
  const raw = type === 'pdf' ? (await pdfParse(new Uint8Array(buf))).text : (await mammoth.extractRawText({ buffer: buf })).value;
  return raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
