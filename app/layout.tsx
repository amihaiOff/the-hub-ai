import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { Suspense } from 'react';
import './globals.css';
import { AppShell, ServiceWorkerRegister } from '@/components/shared';
import { QueryProvider } from '@/lib/providers/query-provider';
import { SessionProvider } from '@/lib/providers/session-provider';
import { HouseholdProvider } from '@/lib/contexts/household-context';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'The Hub AI - Financial Management',
  description: 'Personal household financial management application',
  applicationName: 'The Hub AI',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'The Hub AI',
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
  themeColor: '#0d0e10',
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
      <body className={`${inter.variable} ${manrope.variable} font-sans antialiased`}>
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
