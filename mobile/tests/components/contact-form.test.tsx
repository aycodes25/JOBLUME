import { fireEvent, render, screen } from '@testing-library/react-native';
import { ContactForm } from '@/components/profile/ContactForm';

const initial = { fullName: 'Ada Lovelace', phone: '', city: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '' };

describe('ContactForm', () => {
  it('shows the stored values and the https note', async () => {
    await render(<ContactForm initial={initial} onSubmit={jest.fn()} />);
    expect(screen.getByLabelText('Full name')).toHaveDisplayValue('Ada Lovelace');
    expect(screen.getByLabelText('Phone')).toHaveDisplayValue('');
    expect(screen.getByText(/must start with https/i)).toBeOnTheScreen();
  });

  it('submits the changed details', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ContactForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '+234 801 234 5678');
    await fireEvent.changeText(screen.getByLabelText('City'), 'Lagos');
    await fireEvent.changeText(screen.getByLabelText('LinkedIn link'), 'https://www.linkedin.com/in/ada');
    await fireEvent.press(screen.getByRole('button', { name: 'Save contact details' }));
    expect(onSubmit).toHaveBeenCalledWith({
      full_name: 'Ada Lovelace', phone: '+234 801 234 5678', city: 'Lagos', linkedin_url: 'https://www.linkedin.com/in/ada', github_url: null, portfolio_url: null,
    });
    expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  });

  it('shows a message under a bad link and does not submit', async () => {
    const onSubmit = jest.fn();
    await render(<ContactForm initial={initial} onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByLabelText('GitHub link'), 'http://github.com/ada');
    await fireEvent.press(screen.getByRole('button', { name: 'Save contact details' }));
    expect(screen.getByText('Enter a full link that starts with https://')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
