'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { MobileHeader } from './mobile-header';
import { MobileMenu } from './mobile-menu';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Header */}
      <MobileHeader onMenuClick={() => setMenuOpen(true)} />

      {/* Mobile Menu (Sheet) */}
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />

      {/* Main Content */}
      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
