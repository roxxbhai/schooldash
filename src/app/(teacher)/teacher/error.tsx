'use client';

import { RouteError } from '@/components/route-error';

export default function TeacherError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError retry={retry} digest={error.digest} />;
}
