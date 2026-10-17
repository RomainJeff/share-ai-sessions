/** GET /share-session.skill — the packaged skill, built into dist/ by `npm run build:skill`. */
export async function skillDownload(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  if (!asset.ok) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(asset.body, { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="share-session.skill"',
    "Cache-Control": "private, no-cache",
  } });
}
