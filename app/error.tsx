'use client';

import { ErrorDetails } from '@/components/shared/error-details';

export default function Error(props: { error: Error & { digest?: string } }) {
  return <ErrorDetails {...props} />;
}
