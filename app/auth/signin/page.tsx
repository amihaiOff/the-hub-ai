'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Suspense, useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const errorMessages: Record<string, string> = {
    AccessDenied: 'Your email is not authorized to access this application.',
    Configuration: 'There is a problem with the server configuration.',
    Verification: 'The magic link has expired or has already been used.',
    Default: 'An error occurred during sign in.',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setEmailError(null);
    setIsLoading(true);

    try {
      // Check if email is in allowlist before sending magic link
      const checkResponse = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const { allowed } = await checkResponse.json();

      if (!allowed) {
        setEmailError('This email is not authorized to access this application.');
        return;
      }

      // Email is allowed, send magic link
      await signIn('resend', { email: email.trim(), callbackUrl });
    } catch {
      setEmailError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg">
            <span className="text-primary-foreground text-xl font-bold">H</span>
          </div>
          <CardTitle className="text-2xl">Welcome to The Hub AI</CardTitle>
          <CardDescription>Sign in to manage your household finances</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(error || emailError) && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              {emailError || errorMessages[error!] || errorMessages.Default}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={isLoading || !email}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Sending magic link...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-5 w-5" />
                  Send magic link
                </>
              )}
            </Button>
          </form>
          <p className="text-muted-foreground text-center text-xs">
            We&apos;ll send you a magic link to sign in. No password needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
