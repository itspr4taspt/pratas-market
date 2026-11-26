// Cloudflare Worker: serve o site (pasta public) e cria tickets no Discord.
const cors = o => ({
  "Access-Control-Allow-Origin": o,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
  "Content-Type": "application/json"
});
const clip = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").slice(0, n).trim();

export default {
  async fetch(req, env) {
    const allowed = (env.ALLOWED_ORIGIN || "*").split(",").map(x => x.trim());
    const reqOrigin = req.headers.get("Origin") || "";
    const any = allowed.includes("*");
    const h = cors(any ? "*" : allowed.includes(reqOrigin) ? reqOrigin : allowed[0]);
    const out = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });

    try {
      if (req.method === "OPTIONS") return new Response(null, { headers: h });
      if (req.method !== "POST") return out({ erro: "Método inválido." }, 405);
      if (!any && !allowed.includes(reqOrigin)) return out({ erro: "Origem não permitida." }, 403);
      if (!env.DISCORD_WEBHOOK) return out({ erro: "O servidor ainda não tem o webhook configurado." }, 500);

      let b;
      try { b = await req.json(); } catch { return out({ erro: "Pedido inválido." }, 400); }
      if (b.hp) return out({ id: "0000" });

      const nome = clip(b.nome, 60), disc = clip(b.discord, 40), ass = clip(b.assunto, 60), msg = clip(b.mensagem, 1500);
      if (!nome || !disc || !msg) return out({ erro: "Preenche todos os campos." }, 400);

      // limite: 1 ticket / 30s por IP (guardado só depois de enviar com sucesso)
      const key = new Request("https://rl.local/" + (req.headers.get("CF-Connecting-IP") || "x"));
      let cache = null; try { cache = caches.default; if (await cache.match(key)) return out({ erro: "Aguarda 30 segundos antes de enviar outro ticket." }, 429); } catch {}

      const id = String(Math.floor(1000 + Math.random() * 9000));
      const payload = {
        username: "Tickets do Site",
        allowed_mentions: { parse: [] },
        embeds: [{
          title: `🎫 Ticket #${id}: ${ass}`, description: msg, color: 0x2a3cff,
          fields: [
            { name: "Nome", value: nome, inline: true },
            { name: "Discord", value: disc, inline: true },
            { name: "Produto", value: clip(b.produto, 80) || "-", inline: true },
            { name: "Página", value: clip(b.pagina, 200) || "-" }
          ],
          timestamp: new Date().toISOString()
        }]
      };
      const send = forum => fetch(env.DISCORD_WEBHOOK + "?wait=true", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forum ? { ...payload, thread_name: `Ticket #${id} - ${nome}`.slice(0, 100) } : payload)
      });

      const forum = env.FORUM !== "false";
      let r = await send(forum);
      if (r.status === 400) r = await send(!forum); // tipo de canal diferente do configurado: tenta o outro
      if (!r.ok) return out({ erro: `O Discord recusou o ticket (código ${r.status}).` }, 502);

      if (cache) try { await cache.put(key, new Response("1", { headers: { "Cache-Control": "max-age=30" } })); } catch {}
      return out({ id });
    } catch (e) {
      return out({ erro: "Erro interno no servidor." }, 500);
    }
  }
};
