// Ikon garis 16px (stroke 1.6) — satu gaya untuk seluruh aplikasi, tanpa dependensi tambahan.

const PATHS = {
  search: <><circle cx="7.25" cy="7.25" r="4.75" /><path d="m13.5 13.5-2.9-2.9" /></>,
  plus: <path d="M8 3.25v9.5M3.25 8h9.5" />,
  x: <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" />,
  check: <path d="m3.5 8.4 2.9 2.85L12.5 5" />,
  chevronDown: <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />,
  chevronRight: <path d="m6.25 4.5 3.5 3.5-3.5 3.5" />,
  calendar: <><rect x="2.75" y="3.5" width="10.5" height="9.75" rx="2" /><path d="M2.75 6.75h10.5M5.5 2.25v2.5m5-2.5v2.5" /></>,
  clip: <path d="m12.6 7.4-4.95 4.95a2.75 2.75 0 0 1-3.9-3.9l5.3-5.3a1.85 1.85 0 0 1 2.6 2.6L6.4 11a.9.9 0 0 1-1.3-1.3l4.6-4.6" />,
  link: <><path d="M6.75 9.25a2.5 2.5 0 0 0 3.55 0l2-2a2.5 2.5 0 0 0-3.55-3.55l-.5.5" /><path d="M9.25 6.75a2.5 2.5 0 0 0-3.55 0l-2 2a2.5 2.5 0 0 0 3.55 3.55l.5-.5" /></>,
  user: <><circle cx="8" cy="5.75" r="2.5" /><path d="M3.25 13c.6-2.3 2.5-3.5 4.75-3.5s4.15 1.2 4.75 3.5" /></>,
  users: <><circle cx="6" cy="6" r="2.25" /><path d="M2 12.75c.5-2 2-3 4-3s3.5 1 4 3" /><path d="M10.25 3.9a2.25 2.25 0 0 1 0 4.2M11.75 9.9c1.1.4 1.9 1.3 2.25 2.85" /></>,
  flag: <path d="M3.75 13.75V2.75m0 .5h7.5l-1.5 2.75 1.5 2.75h-7.5" />,
  status: <><circle cx="8" cy="8" r="5.25" /><path d="M8 5.25V8l1.75 1.25" /></>,
  folder: <path d="M2.75 4.75c0-.83.67-1.5 1.5-1.5h2.3l1.4 1.5h3.8c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-7.5c-.83 0-1.5-.67-1.5-1.5z" />,
  download: <path d="M8 2.75v7.5m0 0L5 7.25m3 3 3-3M3 12.75h10" />,
  trash: <path d="M3 4.5h10M6.25 4.5V3.25h3.5V4.5m-5 0 .5 8.25h5.5l.5-8.25" />,
  archive: <><rect x="2.5" y="3" width="11" height="3" rx="1" /><path d="M3.5 6v6.25c0 .4.35.75.75.75h7.5c.4 0 .75-.35.75-.75V6M6.5 8.75h3" /></>,
  restore: <path d="M3.25 8a4.75 4.75 0 1 0 1.4-3.35L3.25 6.1m0-2.85V6.1h2.85" />,
  settings: <><circle cx="8" cy="8" r="1.9" /><path d="M8 1.9v1.5m0 9.2v1.5m4.3-10.4-1.05 1.05M4.75 11.25 3.7 12.3m10.4-4.3h-1.5m-9.2 0H1.9m10.4 4.3-1.05-1.05M4.75 4.75 3.7 3.7" /></>,
  logout: <path d="M9.75 3.25h2.5c.4 0 .75.35.75.75v8c0 .4-.35.75-.75.75h-2.5M7 10.75 9.75 8 7 5.25M9.5 8H2.75" />,
  lock: <><rect x="3.25" y="7" width="9.5" height="6.25" rx="1.5" /><path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" /></>,
  alert: <><path d="M8 2.5 14 13H2z" /><path d="M8 6.75v2.75m0 1.9v.05" /></>,
  loop: <path d="M11.5 3.75 13.25 5.5 11.5 7.25M13 5.5H5.25a2.5 2.5 0 0 0-2.5 2.5M4.5 12.25 2.75 10.5 4.5 8.75M3 10.5h7.75a2.5 2.5 0 0 0 2.5-2.5" />,
  note: <path d="M3.5 4h9M3.5 7h9M3.5 10h5.5" />,
  sort: <path d="M5 3v10m0 0-2-2m2 2 2-2m4-8v10m0-10 2 2m-2-2-2 2" />,
  sun: <><circle cx="8" cy="8" r="2.75" /><path d="M8 1.75v1.5m0 9.5v1.5M3.6 3.6l1.05 1.05m6.7 6.7 1.05 1.05M1.75 8h1.5m9.5 0h1.5M3.6 12.4l1.05-1.05m6.7-6.7L12.4 3.6" /></>,
  moon: <path d="M13.1 9.6A5.5 5.5 0 0 1 6.4 2.9a5.5 5.5 0 1 0 6.7 6.7z" />,
  monitor: <><rect x="2.25" y="3" width="11.5" height="7.75" rx="1.25" /><path d="M6 13.25h4M8 10.75v2.5" /></>,
  grip:<><circle cx="6" cy="4" r=".8" /><circle cx="10" cy="4" r=".8" /><circle cx="6" cy="8" r=".8" /><circle cx="10" cy="8" r=".8" /><circle cx="6" cy="12" r=".8" /><circle cx="10" cy="12" r=".8" /></>,
};

export default function Icon({ name, size = 16, className, strokeWidth = 1.6, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `icon ${className}` : "icon"}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
