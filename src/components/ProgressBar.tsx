type ProgressBarProps = {
  value: number;
  max: number;
};

export function ProgressBar({ value, max }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Today</span>
        <span className="text-muted-foreground">
          {value} / {max}
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
