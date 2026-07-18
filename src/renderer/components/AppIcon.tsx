import React, { useId } from 'react';

/** Inline app mark — avoids absolute /icon.png which breaks under Electron file://. */
export function AppIcon({
  className = 'h-9 w-9',
  title = 'PillOpsDesk',
}: {
  className?: string;
  title?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const bgId = `pod-bg-${uid}`;
  const mintId = `pod-mint-${uid}`;
  const clipId = `pod-clip-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#256964" />
          <stop offset="100%" stopColor="#123433" />
        </linearGradient>
        <linearGradient id={mintId} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#b8e0dc" />
          <stop offset="100%" stopColor="#69b5ae" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="-110" y="-270" width="220" height="540" rx="110" />
        </clipPath>
      </defs>
      <rect width="1024" height="1024" fill={`url(#${bgId})`} rx="180" />
      <g transform="translate(470 480) rotate(-24)">
        <g clipPath={`url(#${clipId})`}>
          <rect x="-110" y="-270" width="220" height="270" fill="#f8fafc" />
          <rect x="-110" y="0" width="220" height="270" fill={`url(#${mintId})`} />
          <rect x="-110" y="-6" width="220" height="12" fill="#1c4442" opacity="0.22" />
          <ellipse cx="-36" cy="130" rx="24" ry="100" fill="#ffffff" opacity="0.22" />
        </g>
      </g>
      <g transform="translate(760 760)">
        <circle cx="0" cy="0" r="108" fill="#eef7f6" />
        <rect x="-24" y="-70" width="48" height="140" rx="12" fill="#205552" />
        <rect x="-70" y="-24" width="140" height="48" rx="12" fill="#205552" />
      </g>
    </svg>
  );
}
