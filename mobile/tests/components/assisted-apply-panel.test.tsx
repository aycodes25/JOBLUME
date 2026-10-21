jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AssistedApplyPanel, type AssistedApplyActions } from '@/components/applications/AssistedApplyPanel';
import { detail } from '../fixtures';

function actions(over: Partial<AssistedApplyActions> = {}) {
  return {
    openUrl: jest.fn().mockResolvedValue(true),
    sharePdf: jest.fn().mockResolvedValue('shared'),
    copyText: jest.fn().mockResolvedValue(true),
    ...over,
  };
}

describe('AssistedApplyPanel', () => {
  it('opens the posting, shares the PDF and copies the letter, sending nothing', async () => {
    const a = actions();
    const onMarkApplied = jest.fn();
    await render(<AssistedApplyPanel app={detail({ status: 'approved' })} onMarkApplied={onMarkApplied} actions={a} />);
    await fireEvent.press(screen.getByRole('button', { name: '1. Open job posting' }));
    expect(a.openUrl).toHaveBeenCalledWith('https://example.com/j');
    await fireEvent.press(screen.getByRole('button', { name: '2. Share CV PDF' }));
    expect(a.sharePdf).toHaveBeenCalledWith('https://files.example.com/cv.pdf', 'CV - Data Analyst - Acme.pdf');
    await fireEvent.press(screen.getByRole('button', { name: '3. Copy cover letter' }));
    expect(a.copyText).toHaveBeenCalledWith('Dear team, I would like to apply for the Data Analyst role at Acme.');
    expect(await screen.findByText('Copied.')).toBeOnTheScreen();
    expect(onMarkApplied).not.toHaveBeenCalled();
  });

  it('marks as applied only on tap', async () => {
    const onMarkApplied = jest.fn();
    await render(<AssistedApplyPanel app={detail({ status: 'approved' })} onMarkApplied={onMarkApplied} actions={actions()} />);
    await fireEvent.press(screen.getByRole('button', { name: '4. Mark as applied' }));
    expect(onMarkApplied).toHaveBeenCalledTimes(1);
  });

  it('hides links that are not http(s)', async () => {
    await render(
      <AssistedApplyPanel
        app={detail({ cv_pdf_url: null, job: { title: 'X', company: 'Y', location: '', source: 'remotive', url: 'javascript:alert(1)', company_domain: null } })}
        onMarkApplied={jest.fn()}
        actions={actions()}
      />,
    );
    expect(screen.getByText('This job has no valid link.')).toBeOnTheScreen();
    expect(screen.getByText('The tailored CV PDF is not available yet.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '1. Open job posting' })).toBeNull();
  });

  it('explains a failed download or a phone without sharing', async () => {
    const a = actions({ sharePdf: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('unavailable') });
    await render(<AssistedApplyPanel app={detail()} onMarkApplied={jest.fn()} actions={a} />);
    await fireEvent.press(screen.getByRole('button', { name: '2. Share CV PDF' }));
    expect(await screen.findByText('Could not download the CV PDF. Check your connection and try again.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: '2. Share CV PDF' }));
    expect(await screen.findByText('Sharing is not available on this phone.')).toBeOnTheScreen();
  });

  it('shows only the lock reason while there are unsaved edits', async () => {
    await render(<AssistedApplyPanel app={detail()} onMarkApplied={jest.fn()} actions={actions()} lockedReason="You have unsaved changes." />);
    expect(screen.getByRole('alert')).toHaveTextContent('You have unsaved changes.');
    expect(screen.queryByRole('button', { name: '4. Mark as applied' })).toBeNull();
  });

  it('after marking applied, offers "Applied: open next job" that only navigates', async () => {
    const onOpenNext = jest.fn();
    const onMarkApplied = jest.fn();
    await render(<AssistedApplyPanel app={detail({ status: 'applied' })} onMarkApplied={onMarkApplied} actions={actions()} applied onOpenNext={onOpenNext} />);
    expect(screen.getByText('Marked as applied.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Applied: open next job' }));
    expect(onOpenNext).toHaveBeenCalledTimes(1);
    expect(onMarkApplied).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '4. Mark as applied' })).toBeNull();
  });

  it('shows no next button when there is no next job, and Done leaves', async () => {
    const onDone = jest.fn();
    await render(<AssistedApplyPanel app={detail({ status: 'applied' })} onMarkApplied={jest.fn()} actions={actions()} applied onDone={onDone} />);
    expect(screen.queryByRole('button', { name: 'Applied: open next job' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
