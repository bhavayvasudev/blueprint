export function Divider({ className = "" }: { className?: string }) {
  return <hr className={`border-t border-ink-200 dark:border-ink-800 ${className}`} />;
}
