type ProgressBarProps = {
  value: number;
  max: number;
};

export function ProgressBar({ value, max }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">Today</span>
        <span className="text-slate-600">
          {value} / {max}
        </span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
