/** All transcript and metadata values enter HTML through this text/attribute escape. */
export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function page(title: string, body: string, status = 200): Response {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;color:#202a34;background:#f7f8fa}a{color:#215c9b}header,article,form{background:white;border:1px solid #dce1e6;border-radius:8px;padding:20px;margin:16px 0}form{display:flex;flex-wrap:wrap;gap:12px}label{display:grid;gap:4px}input,button{font:inherit;padding:8px;border:1px solid #aab4bf;border-radius:4px}button,summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px ui-monospace,monospace}nav{display:flex;gap:24px;margin:24px 0}.meta{color:#536170}h1{overflow-wrap:anywhere}details{margin:12px 0}article[data-role="user"]{border-left:4px solid #215c9b}</style></head>
<body><nav><a href="/">Claude Session Share</a></nav><main>${body}</main>
<script nonce="${nonce}">const button=document.querySelector('[data-copy]');if(button)button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Copié';}catch{button.textContent='Copie indisponible : sélectionnez la commande ci-dessous';}});</script>
</body></html>`, { status, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
  } });
}
