import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chips } from '@/components/ui/Chips';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { EmptyState, ErrorState, Loading } from '@/components/ui/States';
import { TextField } from '@/components/ui/TextField';

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and ignores presses when disabled or busy', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="Off" onPress={onPress} disabled />
        <Button label="Busy" onPress={onPress} busy />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Busy' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Checkbox', () => {
  function Controlled({ onChange }: { onChange(v: boolean): void }) {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox
        label="Send to this guessed address"
        checked={checked}
        onChange={(v) => {
          setChecked(v);
          onChange(v);
        }}
      />
    );
  }

  it('toggles and reports its state', async () => {
    const onChange = jest.fn();
    await render(<Controlled onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Send to this guessed address' });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'Send to this guessed address' })).toBeChecked();
  });
});

describe('Chips', () => {
  it('marks the selected chip and reports a new choice', async () => {
    const onChange = jest.fn();
    await render(
      <Chips label="Filter" value="all" onChange={onChange} options={[{ value: 'all', label: 'All' }, { value: 'high', label: '90%+' }]} />,
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
    expect(screen.getByRole('button', { name: '90%+' })).not.toBeSelected();
    await fireEvent.press(screen.getByRole('button', { name: '90%+' }));
    expect(onChange).toHaveBeenCalledWith('high');
  });
});

describe('TextField', () => {
  it('is found by its label and shows an error instead of the hint', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Recipient" value="a@b.co" onChangeText={onChangeText} hint="Hint" error="Bad address" />);
    expect(screen.getByLabelText('Recipient')).toHaveDisplayValue('a@b.co');
    await fireEvent.changeText(screen.getByLabelText('Recipient'), 'x@y.co');
    expect(onChangeText).toHaveBeenCalledWith('x@y.co');
    expect(screen.getByRole('alert')).toHaveTextContent('Bad address');
    expect(screen.queryByText('Hint')).toBeNull();
  });
});

describe('States', () => {
  it('ErrorState shows the message and retries', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState message="Cannot reach the server." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('Loading and EmptyState render', async () => {
    await render(
      <>
        <Loading />
        <EmptyState title="Nothing here" description="Come back later." />
      </>,
    );
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.getByText('Nothing here')).toBeOnTheScreen();
  });
});

describe('ScoreRing and Badge', () => {
  it('labels the score for screen readers', async () => {
    await render(
      <>
        <ScoreRing score={92} />
        <ScoreRing score={null} />
        <Badge label="96% MATCH" tone="primary" />
      </>,
    );
    expect(screen.getByLabelText('Match score 92 out of 100')).toBeOnTheScreen();
    expect(screen.getByLabelText('No match score')).toBeOnTheScreen();
    expect(screen.getByText('96% MATCH')).toBeOnTheScreen();
  });
});

describe('OptionSheet', () => {
  it('selects another option and closes, and only closes for the current one', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    await render(
      <OptionSheet
        visible
        title="Move to"
        current="applied"
        options={[{ value: 'applied', label: 'Applied' }, { value: 'offer', label: 'Offer' }]}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Applied (current)' }));
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Offer' }));
    expect(onSelect).toHaveBeenCalledWith('offer');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
