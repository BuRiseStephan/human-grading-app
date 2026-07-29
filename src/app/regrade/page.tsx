import { Suspense } from "react";

import RegradeClient from "./RegradeClient";

export const dynamic = "force-dynamic";

export default function RegradePage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <RegradeClient />
    </Suspense>
  );
}
