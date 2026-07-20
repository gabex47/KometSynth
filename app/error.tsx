"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="route-state"><div role="alert"><AlertTriangle size={25} /><h1>Workspace interrupted.</h1><p>The secure shell hit an unexpected error. Your session data was not exposed.</p><button onClick={reset}>TRY AGAIN</button></div></main>;
}
