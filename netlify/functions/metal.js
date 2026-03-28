exports.handler = async (event) => {
  try {
    const rawSymbol = String(event.queryStringParameters?.symbol || "").toUpperCase();

    const symbolMap = {
      XAUUSD: "XAU",
      XAGUSD: "XAG",
      XPTUSD: "XPT",
      XAU: "XAU",
      XAG: "XAG",
      XPT: "XPT"
    };

    const apiSymbol = symbolMap[rawSymbol];

    if (!apiSymbol) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: `invalid symbol: ${rawSymbol}` }),
      };
    }

    const url = `https://api.gold-api.com/price/${apiSymbol}`;

    const r = await fetch(url, {
      headers: {
        "accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; NetlifyFunction/1.0)"
      }
    });

    const text = await r.text();

    if (!r.ok) {
      throw new Error(`gold api http ${r.status}: ${text.slice(0, 120)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`invalid json: ${text.slice(0, 120)}`);
    }

    const close =
      Number(data?.price) ||
      Number(data?.value) ||
      Number(data?.close);

    if (!Number.isFinite(close) || close <= 0) {
      throw new Error(`invalid price: ${text.slice(0, 200)}`);
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      },
      body: JSON.stringify({
        symbol: rawSymbol.toLowerCase(),
        date: data?.updatedAt || data?.updated_at || data?.timestamp || data?.date || null,
        close,
        prev_date: null,
        prev_close: null,
        change: null,
        change_pct: null
      })
    };
  } catch (e) {
    console.error("metal function error:", e);

    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: String(e?.message || e)
      })
    };
  }
};
