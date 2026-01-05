'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { MobileHeader } from './mobile-header';
import { MobileMenu } from './mobile-menu';
import { useNeedsOnboarding } from '@/lib/contexts/household-context';

interface AppShellProps {
  children: React.ReactNode;
}

// Paths that don't require authentication or profile
const PUBLIC_PATHS = ['/auth', '/onboarding'];

export function AppShell({ children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const { needsOnboarding, isLoading } = useNeedsOnboarding();

  // Check if current path is public (no auth/profile required)
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // Redirect to onboarding if authenticated user has no profile
  useEffect(() => {
    if (status === 'authenticated' && !isLoading && needsOnboarding && !isPublicPath) {
      router.push('/onboarding');
    }
  }, [status, isLoading, needsOnboarding, isPublicPath, router]);

  // Don't render shell UI for public paths (auth, onboarding)
  if (isPublicPath) {
    return <div className="bg-background min-h-screen">{children}</div>;
  }

  // Show loading state while checking auth/profile
  if (status === 'loading' || isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
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
