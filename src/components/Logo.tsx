export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill="var(--app-elevated)" stroke="var(--app-line-strong)" />
      <rect x="13" y="19" width="38" height="5.5" rx="2.75" fill="var(--app-fg)" opacity=".3" />
      <rect x="13" y="29.25" width="24" height="5.5" rx="2.75" fill="var(--app-accent)" />
      <rect x="13" y="39.5" width="31" height="5.5" rx="2.75" fill="var(--app-fg)" opacity=".3" />
    </svg>
  )
}
