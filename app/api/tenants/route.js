export async function GET() {
    return Response.json({
      tenants: [{ id: "acme", name: "Acme Health" }],
    });
  }