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

    const r = await fetch(stooqUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; NetlifyFunction/1.0)",
        "accept": "text/csv,text/plain;q=0.9,*/*;q=0.8",
      },
    });

    const raw = await r.text();

    console.log("==== STQ FETCH ====");
    console.log("symbol:", symbol);
    console.log("url:", stooqUrl);
    console.log("status:", r.status, r.statusText);
    console.log("content-type:", r.headers.get("content-type"));
    console.log("raw length:", raw.length);
    console.log("raw preview:", JSON.stringify(raw.slice(0, 300)));

    if (!r.ok) {
      throw new Error(`upstream http error: ${r.status}`);
    }

    const text = raw.trim();

    if (!text) {
      throw new Error("empty upstream response");
    }

    if (
      text.startsWith("<!DOCTYPE html") ||
      text.startsWith("<html") ||
      text.includes("<body")
    ) {
      throw new Error("upstream returned HTML instead of CSV");
    }

    if (!text.includes("Date,Open,High,Low,Close")) {
      throw new Error(`unexpected csv format: ${text.slice(0, 120)}`);
    }

    const lines = text.split(/\r?\n/).filter(Boolean);

    if (lines.length < 3) {
      throw new Error(`not enough csv rows: ${lines.length}`);
    }

    const rows = [];
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(",");
      if (parts.length >= 5 && parts[0] && parts[4] && parts[4] !== "Close") {
        rows.push(parts);
        if (rows.length === 2) break;
      }
    }

    if (rows.length < 2) {
      throw new Error("failed to find latest/prev rows");
    }

    const latest = rows[0];
    const prev = rows[1];

    const parseNum = (v) => {
      const n = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const date = latest[0];
    const close = parseNum(latest[4]);
    const prev_date = prev[0];
    const prev_close = parseNum(prev[4]);

    if (close === null || close <= 0) {
      throw new Error(`invalid close value: ${latest[4]}`);
    }

    if (prev_close === null || prev_close <= 0) {
      throw new Error(`invalid prev_close value: ${prev[4]}`);
    }

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
    console.error("FUNCTION ERROR:", e);

    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: String(e?.message || e),
      }),
    };
  }
};
