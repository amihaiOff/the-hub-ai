'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Suspense } from 'react';

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, { title: string; description: string }> = {
    Configuration: {
      title: 'Server Configuration Error',
      description:
        'There is a problem with the server configuration. Please contact the administrator.',
    },
    AccessDenied: {
      title: 'Access Denied',
      description: 'Your email address is not authorized to access this application.',
    },
    Verification: {
      title: 'Verification Error',
      description: 'The verification link may have expired or already been used.',
    },
    Default: {
      title: 'Authentication Error',
      description: 'An error occurred during authentication. Please try again.',
    },
  };

  const { title, description } = errorMessages[error || ''] || errorMessages.Default;

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-destructive mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
            <span className="text-destructive-foreground text-xl font-bold">!</span>
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/auth/signin">Try Again</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
