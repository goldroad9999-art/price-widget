exports.handler = async (event) => {
  try {
    const rawSymbol = String(event.queryStringParameters?.symbol || "").toUpperCase();

    const symbolMap = {
      XAUUSD: "gold",
      XAGUSD: "silver",
      XPTUSD: "platinum",
      XAU: "gold",
      XAG: "silver",
      XPT: "platinum",
    };

    const metalCode = symbolMap[rawSymbol];

    if (!metalCode) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: `invalid symbol: ${rawSymbol}` }),
      };
    }

    const API_KEY = process.env.METAL_API_KEY;

    if (!API_KEY) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "missing METAL_API_KEY" }),
      };
    }

    const url =
      `https://api.metals.dev/v1/metal/spot` +
      `?api_key=${encodeURIComponent(API_KEY)}` +
      `&metal=${encodeURIComponent(metalCode)}` +
      `&currency=USD`;

    const r = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; NetlifyFunction/1.0)",
      },
    });

    const text = await r.text();

    if (!r.ok) {
      throw new Error(`metals.dev http ${r.status}: ${text.slice(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`invalid json: ${text.slice(0, 200)}`);
    }

    if (data?.status === "failure") {
      throw new Error(data?.error_message || `api failure: ${text.slice(0, 200)}`);
    }

    const close = Number(data?.rate?.price);
    const change = Number(data?.rate?.change);
    const change_pct = Number(data?.rate?.change_percent);

    if (!Number.isFinite(close) || close <= 0) {
      throw new Error(`invalid price: ${text.slice(0, 200)}`);
    }

    const hasChange = Number.isFinite(change);
    const hasPct = Number.isFinite(change_pct);

    const prevClose =
      hasChange ? close - change : null;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        symbol: rawSymbol.toLowerCase(),
        metal: metalCode,
        date: data?.timestamp || null,
        close,
        prev_close: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : null,
        change: hasChange ? change : null,
        change_pct: hasPct ? change_pct : null,
      }),
    };
  } catch (e) {
    console.error("metal function error:", e);

    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: String(e?.message || e),
      }),
    };
  }
};
