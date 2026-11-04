import { useRouteError } from 'react-router';

/** Last-resort error screen for routing failures. */
export function RouteError() {
  const error = useRouteError() as Error | undefined;
  return (
    <div role="alert" className="m-8 rounded-lg border-2 border-danger p-6">
      <p className="font-semibold">Something went wrong while loading this page.</p>
      <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{error?.message ?? String(error)}</pre>
    </div>
  );
}
