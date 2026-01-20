'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/lib/hooks/use-auth';
import { Sidebar } from './sidebar';
import { MobileHeader } from './mobile-header';
import { MobileMenu } from './mobile-menu';
import { useNeedsOnboarding } from '@/lib/contexts/household-context';

interface AppShellProps {
  children: React.ReactNode;
}

// Paths that don't require authentication or profile
const PUBLIC_PATHS = ['/auth', '/onboarding', '/handler'];

export function AppShell({ children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const { needsOnboarding, isLoading } = useNeedsOnboarding();

  // Check if current path is public (no auth/profile required)
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // Redirect to login if no user (not authenticated)
  useEffect(() => {
    if (!user && !isPublicPath) {
      router.push('/handler/sign-in');
    }
  }, [user, isPublicPath, router]);

  // Redirect to onboarding if authenticated user has no profile
  useEffect(() => {
    if (user && !isLoading && needsOnboarding && !isPublicPath) {
      router.push('/onboarding');
    }
  }, [user, isLoading, needsOnboarding, isPublicPath, router]);

  // Don't render shell UI for public paths (auth, onboarding, handler)
  if (isPublicPath) {
    return <div className="bg-background min-h-screen">{children}</div>;
  }

  // Show loading state while checking profile
  if (isLoading) {
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
