import Link from 'next/link';
import Image from 'next/image';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <Image
        src="/icons/icon-192.png"
        alt=""
        width={32}
        height={32}
        priority
        className="h-8 w-8 rounded-md"
      />
      <span className="text-lg font-bold tracking-tight">The Hub</span>
    </Link>
  );
}
