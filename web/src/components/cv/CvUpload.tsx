'use client';

import { UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { describeApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

export const MAX_CV_BYTES = 5 * 1024 * 1024;

export function validateCvFile(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Upload a PDF or DOCX file.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_CV_BYTES) return 'That file is larger than 5 MB.';
  return null;
}

export interface CvUploadProps {
  onUpload(file: File): Promise<void>;
  currentName?: string | null;
}

export function CvUpload({ onUpload, currentName }: CvUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || status === 'uploading') return;
    const problem = validateCvFile(file);
    if (problem) {
      setError(problem);
      setStatus('idle');
      return;
    }
    setError(null);
    setStatus('uploading');
    try {
      await onUpload(file);
      setStatus('done');
    } catch (err) {
      setError(describeApiError(err));
      setStatus('idle');
    }
  }

  return (
    <div className="space-y-3">
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-white p-8 text-center text-sm transition-colors hover:bg-blue-50/60',
          dragging && 'border-primary bg-blue-50',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
      >
        <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-primary" aria-hidden="true">
          <UploadCloud className="h-6 w-6" />
        </span>
        <span className="font-medium">{status === 'uploading' ? 'Uploading…' : 'Drop your CV here or click to choose'}</span>
        <span className="text-muted-foreground">PDF or DOCX, up to 5 MB, with selectable text</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          aria-label="CV file"
          className="sr-only"
          disabled={status === 'uploading'}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {currentName && <p className="text-sm text-muted-foreground">Current CV: {currentName}</p>}
      {status === 'done' && (
        <p role="status" className="text-sm text-emerald-600">
          CV uploaded.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
