import IntegrationDemo from "@/components/integration-demo";

export const metadata = {
  title: "Integration demo · LedgerLock",
  description:
    "Simulate an external app calling LedgerLock POST /api/events — B2B middleware, not just a dashboard.",
};

export default function IntegratePage() {
  return <IntegrationDemo />;
}
