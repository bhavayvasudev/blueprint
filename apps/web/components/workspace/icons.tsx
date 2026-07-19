/** Blueprint's icon set — one stroke weight, one grid, drawn inline so
 * the workspace ships zero icon dependencies and every glyph can be
 * animated like any other DOM node. */

interface IconProps {
  className?: string;
}

function base(className?: string) {
  return {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function IconOverview({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </svg>
  );
}

export function IconArchitecture({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" />
      <path d="m3.5 12.2 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.7 8.5 4.5 8.5-4.5" />
    </svg>
  );
}

export function IconFeatures({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3.2 20 7.7v8.6l-8 4.5-8-4.5V7.7l8-4.5Z" />
      <path d="M12 12.2 20 7.7M12 12.2 4 7.7M12 12.2v8.6" />
    </svg>
  );
}

export function IconFindings({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10.2v4" />
      <path d="M12 16.9v.1" />
    </svg>
  );
}

export function IconRoadmap({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 17.5 9 12l4 3.5 7.5-8" />
      <path d="M15.5 7.5h5v5" />
    </svg>
  );
}

export function IconGraph({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="8" r="2.3" />
      <circle cx="9" cy="18" r="2.3" />
      <path d="m7.9 7.3 8-0.8M7 8.2l1.4 7.5M16.6 9.8l-6 6.6" />
    </svg>
  );
}

export function IconPrompt({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.5 3 2.5-3 2.5M12.5 14.5H17" />
    </svg>
  );
}

export function IconBriefing({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="3.5" width="14" height="17" rx="2.2" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </svg>
  );
}

export function IconThreads({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 4.5c4.7 0 8.5 2.9 8.5 6.6S16.7 17.7 12 17.7c-.9 0-1.8-.1-2.6-.3L5 19.5l1.1-3.3c-1.6-1.2-2.6-3-2.6-5.1 0-3.7 3.8-6.6 8.5-6.6Z" />
      <path d="M8.5 10h7M8.5 13h4" />
    </svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 4a5.5 5.5 0 0 0-5.5 5.5c0 4.2-1.4 5.6-2 6.3h15c-.6-.7-2-2.1-2-6.3A5.5 5.5 0 0 0 12 4Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5" />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20.2 14.2A8.2 8.2 0 0 1 9.8 3.8a8.2 8.2 0 1 0 10.4 10.4Z" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
    </svg>
  );
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconClock({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2.5" />
    </svg>
  );
}

export function IconWarning({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10.2v4" />
      <path d="M12 16.9v.1" />
    </svg>
  );
}

export function IconMore({ className }: IconProps) {
  return (
    <svg {...base(className)} fill="currentColor" stroke="none">
      <circle cx="12" cy="5.5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18.5" r="1.6" />
    </svg>
  );
}

export function IconSpinner({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    </svg>
  );
}

export function IconGitHub({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.8A10.4 10.4 0 0 0 8.7 22.1c.5.1.7-.2.7-.5v-1.9c-2.9.6-3.5-1.2-3.5-1.2-.5-1.2-1.2-1.5-1.2-1.5-1-.6.1-.6.1-.6 1 .1 1.6 1.1 1.6 1.1.9 1.6 2.5 1.1 3.1.9.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.2 0-1.1.4-2 1.1-2.8-.1-.2-.5-1.3.1-2.7 0 0 .9-.3 2.9 1.1a10 10 0 0 1 5.2 0c2-1.4 2.9-1.1 2.9-1.1.6 1.4.2 2.5.1 2.7.7.8 1.1 1.7 1.1 2.8 0 4-2.5 4.9-4.8 5.2.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.4 10.4 0 0 0 12 1.8Z" />
    </svg>
  );
}

export function IconSpark({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3.5c.6 4.6 2 6.9 7.5 8.5-5.5 1.6-6.9 3.9-7.5 8.5-.6-4.6-2-6.9-7.5-8.5 5.5-1.6 6.9-3.9 7.5-8.5Z" />
    </svg>
  );
}

export function IconInsights({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 20V10.5M11.5 20V4M19 20v-6.5" />
      <path d="M2.5 20h19" />
    </svg>
  );
}

export function IconAppearance({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m19.5 19.5-4.3-4.3" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M20.5 12h-2.3M5.8 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8 6.2 6.2" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M4.8 20c1.2-3.6 4-5.5 7.2-5.5s6 1.9 7.2 5.5" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
      <path d="M20 12H10.5M20 12l-3.5-3.5M20 12l-3.5 3.5" />
    </svg>
  );
}

export function IconCommand({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9Zm0 0v6m0-6h6m-6 6v2.5A2.5 2.5 0 1 1 6.5 15H9Zm6-6V6.5A2.5 2.5 0 1 1 17.5 9H15Zm0 0v6m0 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15Z" />
    </svg>
  );
}

export function IconPin({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 4.5h6l-1 5 3 3v1.5H7V12.5l3-3-1-5Z" />
      <path d="M12 15v4.5" />
    </svg>
  );
}

export function IconFile({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 3.5h7l5 5v12a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3.5Z" />
      <path d="M13 3.5V8.5h5" />
    </svg>
  );
}

export function IconSymbol({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 5.5 5.5 12 9 18.5M15 5.5 18.5 12 15 18.5" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 6.5h14M9.5 6.5V4.5h5v2M7 6.5l1 13h8l1-13" />
    </svg>
  );
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 19.5v-15M6 10.5l6-6 6 6" />
    </svg>
  );
}

/** The Blueprint mark — a "B" set in a rounded plate, used at every
 * scale from favicon-size to the sidebar wordmark. */
export function BlueprintMark({ className, size }: IconProps & { size?: number }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      {...(size ? { width: size, height: size } : {})}
    >
      <rect x="1" y="1" width="30" height="30" rx="9" fill="currentColor" fillOpacity="0.12" />
      <rect x="1" y="1" width="30" height="30" rx="9" stroke="currentColor" strokeOpacity="0.25" />
      <path
        d="M12 9.5h6a3.5 3.5 0 0 1 0 7h-6m0-7v13m0-13h-1.5m1.5 13h6.8a3.5 3.5 0 0 0 0-7H12m0 7h-1.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconFolder({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 6.5a1 1 0 0 1 1-1h4.3l2 2.5h7.7a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-12Z" />
    </svg>
  );
}

export function IconFunction({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M7.5 20.5c2 0 2.5-1.5 2.8-4l1.4-9c.3-2.5.8-4 2.8-4" />
      <path d="M7 11.5h8" />
    </svg>
  );
}

export function IconClass({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 9.5h16M9.5 9.5V20" />
    </svg>
  );
}

export function IconRoute({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="6" cy="6.5" r="2.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M8.5 6.5h5.5a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 7h5.5" />
    </svg>
  );
}

export function IconDoc({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 3.5h12v17H6z" />
      <path d="M9 8h6M9 12h6M9 16h3.5" />
    </svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m12 3.8 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17.2l-5.25 2.75 1-5.85L3.5 9.95l5.9-.85L12 3.8Z" />
    </svg>
  );
}

export function IconFork({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="6.5" cy="5.5" r="2.5" />
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="12" cy="18.5" r="2.5" />
      <path d="M6.5 8v1.5a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3V8" />
      <path d="M12 12.5V16" />
    </svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconIssue({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function IconScale({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 4v16M7 20h10" />
      <path d="M4.5 8h15" />
      <path d="M4.5 8 2 14h5L4.5 8Zm15 0L17 14h5l-2.5-6Z" />
    </svg>
  );
}

export function IconBranch({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="7" cy="5.5" r="2.5" />
      <circle cx="7" cy="18.5" r="2.5" />
      <circle cx="17" cy="8.5" r="2.5" />
      <path d="M7 8v8" />
      <path d="M17 11v.5a4.5 4.5 0 0 1-4.5 4.5H9.5" />
    </svg>
  );
}

export function IconCommit({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M2.5 12h6M15.5 12h6" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 14.6a5.5 5.5 0 0 1 3 4.9" />
    </svg>
  );
}
