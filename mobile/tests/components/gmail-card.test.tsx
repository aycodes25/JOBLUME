import { fireEvent, render, screen } from '@testing-library/react-native';
import { GmailCard, type GmailCardProps } from '@/components/settings/GmailCard';

async function setup(over: Partial<GmailCardProps> = {}) {
  const onConnect = jest.fn();
  const onDisconnect = jest.fn();
  await render(
    <GmailCard status={{ configured: true, connected: false, email: null }} connecting={false} disconnecting={false} onConnect={onConnect} onDisconnect={onDisconnect} {...over} />,
  );
  return { onConnect, onDisconnect };
}

describe('GmailCard', () => {
  it('offers Connect Gmail when not connected', async () => {
    const { onConnect } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('shows the connected address and disconnects', async () => {
    const { onDisconnect } = await setup({ status: { configured: true, connected: true, email: 'me@gmail.com' } });
    expect(screen.getByText('Connected as me@gmail.com')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('explains a server without Gmail settings', async () => {
    await setup({ status: { configured: false, connected: false, email: null } });
    expect(screen.getByText(/not set up on this server/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).toBeNull();
  });

  it('shows the result of coming back from Google', async () => {
    await setup({ returned: { kind: 'error', reason: 'missing_scope' } });
    expect(screen.getByRole('alert')).toHaveTextContent('JobLume needs permission to send email. Connect again and keep every box ticked.');
  });

  it('shows Opening Google… while connecting', async () => {
    await setup({ connecting: true });
    expect(screen.getByRole('button', { name: 'Opening Google…' })).toBeDisabled();
  });
});
