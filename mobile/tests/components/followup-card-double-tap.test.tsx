import { act, render, screen } from '@testing-library/react-native';
import { FollowUpCard } from '@/components/followups/FollowUpCard';
import { followUp } from '../fixtures';

describe('FollowUpCard send', () => {
  it('sends once when Send follow-up is tapped twice in the same frame', async () => {
    const onSend = jest.fn();
    await render(<FollowUpCard followUp={followUp()} pending={false} onSave={jest.fn()} onSend={onSend} onDismiss={jest.fn()} />);
    const press = screen.getByRole('button', { name: 'Send follow-up' }).props.onClick;
    await act(async () => {
      press();
      press();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
