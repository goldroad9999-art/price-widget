exports.handler = async (event) => {
  try {
    const symbol = (event.queryStringParameters?.symbol || "").toUpperCase();

    const allowed = new Set(["XAU", "XAG", "XPT"]);
    if (!allowed.has(symbol)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "invalid symbol" }),
      };
    }

    const url = `https://api.gold-api.com/price/${symbol}`;

    const r = await fetch(url, {
      headers: {
        "accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; NetlifyFunction/1.0)",
      },
    });

    const raw = await r.text();

    console.log("==== GOLD API ====");
    console.log("symbol:", symbol);
    console.log("status:", r.status);
    console.log("raw:", raw.slice(0, 200));

    if (!r.ok) {
      throw new Error(`upstream error ${r.status}`);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("invalid json");
    }

    const price =
      Number(data?.price) ||
      Number(data?.value) ||
      Number(data?.close);

    if (!Number.isFinite(price)) {
      throw new Error("invalid price");
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        symbol: symbol.toLowerCase() + "usd",
        date: data?.timestamp || data?.date || null,
        close: price,
        prev_date: null,
        prev_close: null,
        change: null,
        change_pct: null,
      }),
    };
  } catch (e) {
    console.error("ERROR:", e);

    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        error: String(e.message || e),
      }),
    };
  }
};
      }),
    };
  }
};
