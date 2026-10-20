import type { FollowUpWithJob } from '@joblume/shared';
import { useDismissFollowUp, useSendFollowUp, useUpdateFollowUp } from '@/hooks/api';
import { describeApiError } from '@/lib/api/errors';
import { FollowUpCard } from './FollowUpCard';

/** A follow-up card wired to the API. */
export function FollowUpItem({ followUp }: { followUp: FollowUpWithJob }) {
  const update = useUpdateFollowUp();
  const send = useSendFollowUp();
  const dismiss = useDismissFollowUp();
  const error = update.error ?? send.error ?? dismiss.error;
  return (
    <FollowUpCard
      followUp={followUp}
      pending={update.isPending || send.isPending || dismiss.isPending}
      error={error ? describeApiError(error) : null}
      onSave={(patch) => update.mutate({ id: followUp.id, patch })}
      onSend={() => send.mutate(followUp.id)}
      onDismiss={() => dismiss.mutate(followUp.id)}
    />
  );
}
