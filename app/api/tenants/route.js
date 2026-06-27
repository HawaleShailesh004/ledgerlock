export async function GET() {
  return Response.json({
    tenants: [
      { id: "acme", label: "acme-health" },
      { id: "northwind", label: "northwind-bank" },
      { id: "globex", label: "globex-insurance" },
    ],
  });
}
