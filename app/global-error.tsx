'use client';

import './globals.css';
import { ErrorDetails } from '@/components/shared/error-details';

/** Catches crashes in the root layout itself (providers, AppShell). */
export default function GlobalError(props: { error: Error & { digest?: string } }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ErrorDetails {...props} />
      </body>
    </html>
  );
}
