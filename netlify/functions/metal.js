exports.handler = async (event) => {
  try {
    const symbol = (event.queryStringParameters?.symbol || "").toLowerCase();
    const allowed = new Set(["xauusd", "xagusd", "xptusd"]);
    if (!allowed.has(symbol)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "invalid symbol" }),
      };
    }

    const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
    const r = await fetch(stooqUrl, { headers: { "user-agent": "netlify-function" } });
    const csv = await r.text();

    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error("empty csv");

    let last = null;
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(",");
      if (parts.length >= 5 && parts[4] && parts[4] !== "Close") {
        last = parts;
        break;
      }
    }
    if (!last) throw new Error("no latest data");

    const date = last[0];
    const close = Number(last[4]);
    if (!Number.isFinite(close) || close <= 0) throw new Error("invalid close");

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({ date, close }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: String(e?.message || e) }),
    };
  }
};