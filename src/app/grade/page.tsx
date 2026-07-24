import { Suspense } from "react";

import GradingClient from "./GradingClient";

export const dynamic = "force-dynamic";

export default function GradePage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <GradingClient />
    </Suspense>
  );
}
