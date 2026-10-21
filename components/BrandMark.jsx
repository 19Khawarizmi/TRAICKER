import { useId } from "react";

// Logo Traicker: huruf "A" putih dengan siluet orang (kepala + bahu) di atas gradient merah.
// Sumber yang sama dengan public/brand/ai-mark-square.svg; ukurannya diatur lewat CSS (.brand-mark).
export default function BrandMark({ className = "" }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`brand-mark ${className}`} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#E3101A" />
          <stop offset="0.55" stopColor="#EF1A17" />
          <stop offset="1" stopColor="#FF4F1F" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}-bg)`} />
      <path
        fill="#FFFFFF"
        fillRule="evenodd"
        transform="translate(60 60) scale(0.64) translate(-60 -60)"
        d="M47 8H73L112 112H87A27 27 0 0 0 33 112H8ZM46 57A14 14 0 1 0 74 57A14 14 0 1 0 46 57Z"
      />
    </svg>
  );
}
