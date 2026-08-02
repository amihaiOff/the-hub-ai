'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header
      className="border-border bg-background safe-pt safe-px flex items-center gap-2 border-b p-4 lg:hidden"
      style={{ ['--safe-pt-base' as string]: '1rem', ['--safe-px-base' as string]: '1rem' }}
    >
      <Button variant="ghost" size="icon" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
      <Logo />
    </header>
  );
}
