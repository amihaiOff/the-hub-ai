import Link from 'next/link';

function LogoIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Isometric cube - back faces */}
      <path
        d="M20 4L6 12V28L20 36L34 28V12L20 4Z"
        fill="#1a1b1e"
        stroke="#6ab2ff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Left face */}
      <path
        d="M6 12L20 20V36L6 28V12Z"
        fill="#242629"
        stroke="#6ab2ff"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Right face */}
      <path
        d="M34 12L20 20V36L34 28V12Z"
        fill="#1a1b1e"
        stroke="#6ab2ff"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Top face */}
      <path
        d="M6 12L20 20L34 12L20 4L6 12Z"
        fill="#2a2d31"
        stroke="#6ab2ff"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />
      {/* Inner H - left vertical */}
      <path d="M14 14V24" stroke="#6ab2ff" strokeWidth="2" strokeLinecap="round" />
      {/* Inner H - right vertical */}
      <path d="M26 14V24" stroke="#6ab2ff" strokeWidth="2" strokeLinecap="round" />
      {/* Inner H - horizontal */}
      <path d="M14 19H26" stroke="#6ab2ff" strokeWidth="2" strokeLinecap="round" />
      {/* Horizontal shelf lines */}
      <line x1="12" y1="22" x2="28" y2="22" stroke="#6ab2ff" strokeWidth="0.75" opacity="0.4" />
      <line x1="12" y1="25" x2="28" y2="25" stroke="#6ab2ff" strokeWidth="0.75" opacity="0.3" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <LogoIcon />
      <span className="text-lg font-bold tracking-tight">
        The Hub <span className="text-[#6ab2ff]">AI</span>
      </span>
    </Link>
  );
}
