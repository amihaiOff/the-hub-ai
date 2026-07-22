import type { Metadata, Viewport } from 'next';
import { Lexend, Playfair_Display } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { AppShell, ServiceWorkerRegister } from '@/components/shared';
import { QueryProvider } from '@/lib/providers/query-provider';
import { SessionProvider } from '@/lib/providers/session-provider';
import { HouseholdProvider } from '@/lib/contexts/household-context';

const lexend = Lexend({
  variable: '--font-lexend',
  subsets: ['latin'],
});

// Elegant serif used only for the "The Hub" wordmark.
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'The Hub - Financial Management',
  description: 'Personal household financial management application',
  applicationName: 'The Hub',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Hub',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#2a2f3a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      <body className={`${lexend.variable} ${playfair.variable} font-sans antialiased`}>
        <ServiceWorkerRegister />
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
