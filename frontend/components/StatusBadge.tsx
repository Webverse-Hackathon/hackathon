import type { RunStatus } from '@ally/shared';
import { STATUS_LABEL } from '@/lib/labels';

export function StatusBadge({ status }: { status: RunStatus }) {
  const label = STATUS_LABEL[status];
  return (
    <span className={`badge badge-${label.tone}`}>
      <span aria-hidden="true" className={status === 'RUNNING' ? 'pulse' : undefined}>
        {label.icon}
      </span>
      {label.text}
    </span>
  );
}
