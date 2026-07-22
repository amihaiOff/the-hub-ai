import Link from 'next/link';
import Image from 'next/image';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/icons/icon-192.png"
        alt=""
        width={44}
        height={44}
        priority
        className="h-11 w-11"
      />
      <span
        className="text-2xl font-bold tracking-tight"
        style={{ fontFamily: 'var(--font-playfair), Georgia, serif' }}
      >
        The Hub
      </span>
    </Link>
  );
}
