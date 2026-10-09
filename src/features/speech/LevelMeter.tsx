/** Small five-bar input level indicator. */
export function LevelMeter({ level, active = true }: { level: number; active?: boolean }) {
  const bars = [0.12, 0.28, 0.45, 0.62, 0.8]
  return (
    <div className="flex h-3.5 items-end gap-[2px]" aria-label={`Input level ${Math.round(level * 100)}%`}>
      {bars.map((threshold, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-[background,opacity] duration-75"
          style={{
            height: `${40 + i * 15}%`,
            background: active && level > threshold ? 'var(--app-success)' : 'var(--app-line-strong)',
          }}
        />
      ))}
    </div>
  )
}
