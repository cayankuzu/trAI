export function GET() {
  return Response.json({
    ok: true,
    service: "trAI web MVP",
    timestamp: new Date().toISOString(),
  });
}
