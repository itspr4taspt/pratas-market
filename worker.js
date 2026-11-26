const cors = o => ({
  "Access-Control-Allow-Origin": o,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
});
const clip = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").slice(0, n).trim();

export default {
  async fetch(req, env) {
    const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map(x => x.trim());
    const reqOrigin = req.headers.get("Origin") || "";
    const any = allowed.includes("*");
    const h = cors(any ? "*" : allowed.includes(reqOrigin) ? reqOrigin : allowed[0]);
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    if (req.method !== "POST") return new Response(JSON.stringify({ erro: "Método inválido" }), { status: 405, headers: h });
    if (!any && !allowed.includes(reqOrigin))
      return new Response(JSON.stringify({ erro: "Origem não permitida" }), { status: 403, headers: h });

    let b;
    try { b = await req.json(); } catch { return new Response(JSON.stringify({ erro: "JSON inválido" }), { status: 400, headers: h }); }
    if (b.hp) return new Response(JSON.stringify({ id: "0000" }), { headers: h });

    const nome = clip(b.nome, 60), disc = clip(b.discord, 40), ass = clip(b.assunto, 60), msg = clip(b.mensagem, 1500);
    if (!nome || !disc || !msg) return new Response(JSON.stringify({ erro: "Campos em falta" }), { status: 400, headers: h });

    const ip = req.headers.get("CF-Connecting-IP") || "x";
    const key = new Request("https://rl.local/" + ip);
    const cache = caches.default;
    if (await cache.match(key)) return new Response(JSON.stringify({ erro: "Espera um pouco" }), { status: 429, headers: h });
    await cache.put(key, new Response("1", { headers: { "Cache-Control": "max-age=30" } }));

    const id = String(Math.floor(1000 + Math.random() * 9000));
    const payload = {
      username: "Tickets do Site",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: `🎫 Ticket #${id}: ${ass}`,
        description: msg,
        color: 0x8b7cff,
        fields: [
          { name: "Nome", value: nome, inline: true },
          { name: "Discord", value: disc, inline: true },
          { name: "Produto", value: clip(b.produto, 80) || "-", inline: true },
          { name: "Página", value: clip(b.pagina, 200) || "-" }
        ],
        timestamp: new Date().toISOString()
      }]
    };
    if (env.FORUM !== "false") payload.thread_name = `Ticket #${id} - ${nome}`.slice(0, 100);

    const r = await fetch(env.DISCORD_WEBHOOK + "?wait=true", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!r.ok) return new Response(JSON.stringify({ erro: "Falha no Discord" }), { status: 502, headers: h });
    return new Response(JSON.stringify({ id }), { headers: h });
  }
};
