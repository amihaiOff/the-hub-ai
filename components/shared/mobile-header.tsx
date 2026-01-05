'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="flex items-center justify-between p-4 lg:hidden">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2">
        <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-lg">
          <span className="text-primary-foreground text-sm font-bold">H</span>
        </div>
        <span className="text-lg font-semibold">The Hub AI</span>
      </Link>

      {/* Menu Button */}
      <Button variant="ghost" size="icon" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
    </header>
  );
}
