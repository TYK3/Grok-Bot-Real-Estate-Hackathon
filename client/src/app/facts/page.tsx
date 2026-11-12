import { FactChecksView } from "@/components/facts/FactChecksView";
import { SiteNav } from "@/components/site/SiteNav";
import { FACT_REVIEW_URL, getFactChecks } from "@/lib/fact-checks";

export const dynamic = "force-dynamic";

export default function FactChecksPage() {
  return (
    <div className="re-page">
      <SiteNav />
      <FactChecksView developments={getFactChecks()} reviewUrl={FACT_REVIEW_URL} />
    </div>
  );
}
