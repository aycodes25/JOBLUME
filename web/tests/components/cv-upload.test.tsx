import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CvUpload, MAX_CV_BYTES, validateCvFile } from '@/components/cv/CvUpload';
import { ApiRequestError } from '@/lib/api/client';

const pdf = (name = 'cv.pdf') => new File([new Uint8Array(1000)], name, { type: 'application/pdf' });

function setup(onUpload = vi.fn().mockResolvedValue(undefined)) {
  render(<CvUpload onUpload={onUpload} />);
  // applyAccept:false so we can prove our own validation rejects wrong files
  return { onUpload, user: userEvent.setup({ applyAccept: false }), input: screen.getByLabelText('CV file') };
}

describe('validateCvFile', () => {
  it('accepts pdf and docx within the size limit, case-insensitively', () => {
    expect(validateCvFile({ name: 'cv.pdf', size: 10 })).toBeNull();
    expect(validateCvFile({ name: 'CV.DOCX', size: 10 })).toBeNull();
  });
  it('rejects other types, empty files and files over 5 MB', () => {
    expect(validateCvFile({ name: 'cv.txt', size: 10 })).toMatch(/pdf or docx/i);
    expect(validateCvFile({ name: 'cv.pdf', size: 0 })).toMatch(/empty/i);
    expect(validateCvFile({ name: 'cv.pdf', size: MAX_CV_BYTES + 1 })).toMatch(/5 mb/i);
    expect(validateCvFile({ name: 'cv.pdf', size: MAX_CV_BYTES })).toBeNull();
  });
});

describe('CvUpload', () => {
  it('uploads a valid file and confirms', async () => {
    const { onUpload, user, input } = setup();
    const file = pdf();
    await user.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
    expect(await screen.findByText(/cv uploaded/i)).toBeInTheDocument();
  });

  it('ignores a second file while an upload is pending', async () => {
    let resolve!: () => void;
    const onUpload = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(<CvUpload onUpload={onUpload} />);
    const input = screen.getByLabelText('CV file');
    fireEvent.change(input, { target: { files: [pdf('one.pdf')] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { files: [pdf('two.pdf')] } });
    expect(onUpload).toHaveBeenCalledTimes(1);
    resolve();
    expect(await screen.findByText(/cv uploaded/i)).toBeInTheDocument();
  });

  it('rejects a wrong file type without calling onUpload', async () => {
    const { onUpload, user, input } = setup();
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pdf or docx/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB without calling onUpload', async () => {
    const { onUpload, user, input } = setup();
    await user.upload(input, new File([new Uint8Array(MAX_CV_BYTES + 1)], 'big.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 mb/i);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows the plain-language server error', async () => {
    const { user, input } = setup(vi.fn().mockRejectedValue(new ApiRequestError(422, 'cv_text_too_short')));
    await user.upload(input, pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent(/scanned/i);
  });

  it('shows a generic message for unknown failures', async () => {
    const { user, input } = setup(vi.fn().mockRejectedValue(new Error('boom')));
    await user.upload(input, pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('shows the current CV name when given', () => {
    render(<CvUpload onUpload={vi.fn()} currentName="base-cv.pdf" />);
    expect(screen.getByText(/base-cv\.pdf/)).toBeInTheDocument();
  });
});
