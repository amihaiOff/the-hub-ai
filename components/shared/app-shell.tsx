'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/hooks/use-auth';
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
  const { user, isLoading: isAuthLoading } = useAuthState();
  const { needsOnboarding, isLoading: isProfileLoading } = useNeedsOnboarding();

  // Check if current path is public (no auth/profile required)
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // Combined loading state
  const isLoading = isAuthLoading || isProfileLoading;

  // Redirect to login if no user (not authenticated) - only after auth check completes
  useEffect(() => {
    if (!isAuthLoading && !user && !isPublicPath) {
      router.replace('/handler/sign-in');
    }
  }, [user, isAuthLoading, isPublicPath, router]);

  // Redirect to onboarding if authenticated user has no profile
  useEffect(() => {
    if (user && !isProfileLoading && needsOnboarding && !isPublicPath) {
      router.replace('/onboarding');
    }
  }, [user, isProfileLoading, needsOnboarding, isPublicPath, router]);

  // Don't render shell UI for public paths (auth, onboarding, handler)
  if (isPublicPath) {
    return <div className="bg-background min-h-screen">{children}</div>;
  }

  // Show loading state while checking auth or profile
  if (isLoading || !user) {
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

      {/* Skip-to-content link. Sits at the very top of the tab order, is
          visually hidden until a keyboard user focuses it, and jumps
          straight to the main content — spares them the entire nav
          every page load. */}
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200]"
      >
        Skip to content
      </a>

      {/* Mobile Header */}
      <MobileHeader onMenuClick={() => setMenuOpen(true)} />

      {/* Mobile Menu (Sheet) */}
      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} />

      {/* Main Content.
          `overflow-x-clip` keeps any wide child (e.g. a Tiptap table or the
          full-bleed database block) from overflowing the viewport horizontally.
          On mobile WebKit such overflow inflates the layout viewport, which then
          throws off every position:fixed element — the bottom tab bar stops
          looking pinned and centered dialogs compute their width against the
          inflated width and spill off-screen. `clip` (not `hidden`) clips at the
          viewport edge without creating a scroll container, so the sticky editor
          toolbar and the database block's flush full-bleed still work. */}
      <main id="main-content" tabIndex={-1} className="safe-px safe-pb overflow-x-clip lg:ml-64">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
