jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/hooks/api', () => ({ useProfile: jest.fn(), useUploadCv: jest.fn(), useUpdateProfile: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { CvUpload } from '@/components/cv/CvUpload';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ProfileForm } from '@/components/profile/ProfileForm';
import * as hooks from '@/hooks/api';
import { ApiRequestError } from '@/lib/api/client';
import { ok, profile, type Mocked } from '../fixtures';

const mockHooks = hooks as unknown as Mocked<typeof hooks>;
const pdf = { uri: 'file:///cache/cv.pdf', name: 'cv.pdf', size: 2000, mimeType: 'application/pdf' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CvUpload', () => {
  it('uploads the picked PDF', async () => {
    const onUpload = jest.fn().mockResolvedValue(undefined);
    await render(<CvUpload onUpload={onUpload} pick={async () => pdf} currentName="old.pdf" />);
    expect(screen.getByText('Current CV: old.pdf')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(onUpload).toHaveBeenCalledWith({ uri: pdf.uri, name: 'cv.pdf', mimeType: 'application/pdf' });
    expect(await screen.findByText('CV uploaded.')).toBeOnTheScreen();
  });

  it('refuses a wrong type or a large file without uploading', async () => {
    const onUpload = jest.fn();
    const pick = jest.fn().mockResolvedValueOnce({ ...pdf, name: 'cv.png' }).mockResolvedValueOnce({ ...pdf, size: 6 * 1024 * 1024 });
    await render(<CvUpload onUpload={onUpload} pick={pick} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Upload a PDF or DOCX file.');
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That file is larger than 5 MB.');
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is cancelled, and shows the server message on failure', async () => {
    const onUpload = jest.fn().mockRejectedValue(new ApiRequestError(400, 'cv_text_too_short'));
    const pick = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(pdf);
    await render(<CvUpload onUpload={onUpload} pick={pick} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(onUpload).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Scanned images are not supported/);
  });
});

describe('ProfileForm', () => {
  const initial = { desiredRoles: '', skills: '', location: '' as const, yearsExperience: '', salaryMin: '', salaryMax: '' };

  it('requires a role when asked and submits the parsed patch', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ProfileForm initial={initial} onSubmit={onSubmit} submitLabel="Save and continue" requireRoles />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(screen.getByText('Add at least one role you are looking for.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Roles you want'), 'Data Analyst, BI Analyst');
    await fireEvent.press(screen.getByRole('button', { name: 'Lagos' }));
    await fireEvent.changeText(screen.getByLabelText('Years of experience'), '3');
    await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(onSubmit).toHaveBeenCalledWith({
      desired_roles: ['Data Analyst', 'BI Analyst'],
      skills: [],
      location: 'Lagos',
      years_experience: 3,
      salary_min: null,
      salary_max: null,
    });
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });

  it('explains a salary range the wrong way round', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm initial={{ ...initial, desiredRoles: 'Analyst', salaryMin: '500', salaryMax: '100' }} onSubmit={onSubmit} submitLabel="Save preferences" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    expect(screen.getByText('Minimum salary cannot be higher than maximum salary.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('OnboardingScreen', () => {
  it('starts at the CV step, then preferences, then the queue', async () => {
    const upload = jest.fn().mockResolvedValue({ characters: 900 });
    const update = jest.fn().mockResolvedValue(profile());
    mockHooks.useProfile.mockReturnValue(ok(profile({ base_cv_url: null, desired_roles: [] })));
    mockHooks.useUploadCv.mockReturnValue({ mutateAsync: upload });
    mockHooks.useUpdateProfile.mockReturnValue({ mutateAsync: update });
    await render(<OnboardingScreen pick={async () => pdf} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose your CV' }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('What are you looking for?')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Roles you want'), 'Data Analyst');
    await fireEvent.press(screen.getByRole('button', { name: 'Save and continue' }));
    expect(update).toHaveBeenCalledTimes(1);
    await fireEvent.press(await screen.findByRole('button', { name: 'Go to my queue' }));
    expect(mockReplace).toHaveBeenCalledWith('/queue');
  });

  it('skips the CV step when a CV is already stored', async () => {
    mockHooks.useProfile.mockReturnValue(ok(profile({ desired_roles: [] })));
    mockHooks.useUploadCv.mockReturnValue({ mutateAsync: jest.fn() });
    mockHooks.useUpdateProfile.mockReturnValue({ mutateAsync: jest.fn() });
    await render(<OnboardingScreen />);
    expect(screen.getByText('What are you looking for?')).toBeOnTheScreen();
  });
});
