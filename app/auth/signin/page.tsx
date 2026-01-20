'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Sign-in page that redirects to Stack Auth handler.
 * This page exists to maintain compatibility with old links and redirects.
 */
export default function SignInPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to Stack Auth sign-in handler
    router.replace('/handler/sign-in');
  }, [router]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground animate-pulse">Redirecting to sign in...</div>
    </div>
  );
}
