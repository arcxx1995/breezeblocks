import { Suspense } from "react";
import { ResultClient } from "@/components/ResultClient";

export default function ResultPage() {
  return (
    <Suspense>
      <ResultClient />
    </Suspense>
  );
}
