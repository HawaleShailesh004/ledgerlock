export async function GET() {
  return Response.json({
    tenants: [
      { id: "acme", name: "Acme Health" },
      { id: "northwind", name: "Northwind Bank" },
      { id: "globex", name: "Globex Insurance" },
    ],
  });
}
