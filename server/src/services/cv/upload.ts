import { ApiError } from '../../lib/errors.js';
import { detectCvType, extractCvText } from './parse.js';

export interface CvUploadDeps {
  upload(path: string, bytes: Buffer, contentType: string): Promise<string>;
  setCv(userId: string, value: { text: string; path: string }): Promise<void>;
}

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

const MIN_CV_CHARS = 200;

export function createCvService(deps: CvUploadDeps) {
  return {
    async upload(userId: string, file: { buffer: Buffer }): Promise<{ characters: number }> {
      const type = detectCvType(file.buffer);
      if (!type) throw new ApiError(400, 'unsupported_file_type', 'Upload a PDF or DOCX file');
      const text = await extractCvText(file.buffer, type);
      if (text.length < MIN_CV_CHARS) {
        throw new ApiError(422, 'cv_text_too_short', 'Could not read enough text from this file. Scanned images are not supported.');
      }
      const path = await deps.upload(`${userId}/base-cv.${type}`, file.buffer, CONTENT_TYPES[type]);
      await deps.setCv(userId, { text, path });
      return { characters: text.length };
    },
  };
}
