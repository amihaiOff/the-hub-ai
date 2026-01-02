'use client';

import { Sidebar } from './sidebar';
import { BottomNav } from './bottom-nav';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="pb-20 lg:ml-64 lg:pb-0">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
