/** The workspace's stage: almost nothing. Two soft, static color washes
 * far in the corners and empty space everywhere else — no grid, no
 * particles, no decorative graph. The real architecture graph is
 * product data; it only ever renders inside the Atlas and preview
 * cards, never as wallpaper. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="glow-blob absolute -right-[10%] -top-[20%] h-[60vh] w-[46vw] rounded-full blur-3xl"
        style={{
          opacity: "var(--glow-opacity)",
          background: "radial-gradient(ellipse at center, var(--color-accent-500) 0%, transparent 68%)",
        }}
      />
      <div
        className="absolute -bottom-[24%] -left-[10%] h-[50vh] w-[38vw] rounded-full opacity-40 blur-3xl dark:opacity-25"
        style={{
          background: "radial-gradient(ellipse at center, var(--color-ink-200) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
