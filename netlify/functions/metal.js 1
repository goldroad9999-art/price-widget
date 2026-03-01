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
    if (lines.length < 3) throw new Error("not enough csv rows");

    // 헤더 제외하고, 마지막 2개 유효 라인을 찾기
    const rows = [];
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(",");
      // Date,Open,High,Low,Close,Volume
      if (parts.length >= 5 && parts[0] && parts[4] && parts[4] !== "Close") {
        rows.push(parts);
        if (rows.length === 2) break;
      }
    }
    if (rows.length < 2) throw new Error("no latest/prev rows");

    const latest = rows[0]; // 가장 최신
    const prev = rows[1];   // 그 전날

    const date = latest[0];
    const close = Number(latest[4]);

    const prev_date = prev[0];
    const prev_close = Number(prev[4]);

    if (!Number.isFinite(close) || close <= 0) throw new Error("invalid close");
    if (!Number.isFinite(prev_close) || prev_close <= 0) throw new Error("invalid prev_close");

    const change = close - prev_close;
    const change_pct = (change / prev_close) * 100;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        symbol,
        date,
        close,
        prev_date,
        prev_close,
        change,
        change_pct,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: String(e?.message || e) }),
    };
  }
};
