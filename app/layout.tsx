import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { AppShell } from '@/components/shared';
import { QueryProvider } from '@/lib/providers/query-provider';
import { SessionProvider } from '@/lib/providers/session-provider';
import { HouseholdProvider } from '@/lib/contexts/household-context';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'The Hub AI - Financial Management',
  description: 'Personal household financial management application',
};

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-muted-foreground animate-pulse">Loading...</div>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          <QueryProvider>
            <Suspense fallback={<LoadingFallback />}>
              <HouseholdProvider>
                <AppShell>{children}</AppShell>
              </HouseholdProvider>
            </Suspense>
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
