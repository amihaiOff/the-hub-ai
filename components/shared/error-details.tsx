'use client';

/**
 * Crash screen that shows the actual error. Phones (iOS especially) have no
 * reachable dev console, so the message, stack head and browser version are
 * printed on screen to be screenshotted and reported.
 */
export function ErrorDetails({ error }: { error: Error & { digest?: string } }) {
  const details = [
    `${error.name}: ${error.message}`,
    error.digest ? `digest: ${error.digest}` : null,
    (error.stack ?? '').split('\n').slice(1, 6).join('\n'),
    typeof navigator !== 'undefined' ? navigator.userAgent : null,
    typeof location !== 'undefined' ? location.pathname : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-4">
      <div className="bg-card shadow-glow w-full max-w-lg space-y-4 rounded-3xl p-6">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          Please take a screenshot of this screen and send it over.
        </p>
        <pre className="bg-muted text-muted-foreground max-h-80 overflow-auto rounded-xl p-3 text-xs break-words whitespace-pre-wrap">
          {details}
        </pre>
        <button
          type="button"
          onClick={() => location.reload()}
          className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
