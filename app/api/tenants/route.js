export async function GET() {
  return Response.json({
    tenants: [
      { id: "acme", label: "acme-health" },
      { id: "northwind", label: "northwind-bank" },
      { id: "globex", label: "globex-insurance" },
      { id: "scale-test", label: "scale-test (10k)" },
      { id: "scale-100k", label: "scale-100k (100k)" },
    ],
  });
}
