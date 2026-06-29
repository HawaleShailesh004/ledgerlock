import { verifyChain } from "@/lib/verify";

function sseLine(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req) {
  const body = await req.json();
  const { tenantId, mode, stream } = body;
  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }
  const allowed = new Set(["since-seal", "full"]);
  const verifyMode = allowed.has(mode) ? mode : "since-seal";

  if (stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (payload) =>
          controller.enqueue(encoder.encode(sseLine(payload)));
        try {
          const result = await verifyChain(tenantId, {
            mode: verifyMode,
            onProgress: (progress) => send({ type: "progress", ...progress }),
          });
          send({ type: "done", result });
        } catch (err) {
          send({
            type: "error",
            message: err?.message || "verify_failed",
          });
        }
        controller.close();
      },
    });
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  return Response.json(await verifyChain(tenantId, { mode: verifyMode }));
}
