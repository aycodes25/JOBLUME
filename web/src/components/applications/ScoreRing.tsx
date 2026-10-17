import { scoreTone } from '@/lib/applications';
import { cn } from '@/lib/utils';

const TONE_CLASS = {
  high: 'text-emerald-400',
  mid: 'text-amber-400',
  low: 'text-rose-400',
  none: 'text-muted-foreground',
} as const;

export function ScoreRing({ score, size = 44 }: { score: number | null; size?: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const percent = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={score === null ? 'No match score' : `Match score ${score} out of 100`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', TONE_CLASS[scoreTone(score)])}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <span className="relative text-xs font-semibold">{score ?? '–'}</span>
    </div>
  );
}
