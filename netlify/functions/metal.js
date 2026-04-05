exports.handler = async (event) => {
  try {
    const rawSymbol = String(event.queryStringParameters?.symbol || "").toUpperCase();

    const symbolMap = {
      XAUUSD: "XAU",
      XAGUSD: "XAG",
      XPTUSD: "XPT",
      XAU: "XAU",
      XAG: "XAG",
      XPT: "XPT",
    };

    const apiSymbol = symbolMap[rawSymbol];
    if (!apiSymbol) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "invalid symbol" }),
      };
    }

    const API_KEY = process.env.METAL_API_KEY;

    // 현재가
    const latestRes = await fetch(
      `https://api.metalpriceapi.com/v1/latest?api_key=${API_KEY}&base=USD&currencies=${apiSymbol}`
    );
    const latest = await latestRes.json();
    const close = Number(latest?.rates?.[apiSymbol]);

    // 전날 날짜
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yDate = yesterday.toISOString().split("T")[0];

    // 전날 종가
    const prevRes = await fetch(
      `https://api.metalpriceapi.com/v1/${yDate}?api_key=${API_KEY}&base=USD&currencies=${apiSymbol}`
    );
    const prevData = await prevRes.json();
    const prevClose = Number(prevData?.rates?.[apiSymbol]);

    const hasPrev = Number.isFinite(prevClose) && prevClose > 0;
    const change = hasPrev ? close - prevClose : null;
    const change_pct = hasPrev ? (change / prevClose) * 100 : null;

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: rawSymbol.toLowerCase(),
        close,
        prev_close: hasPrev ? prevClose : null,
        change,
        change_pct,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(e.message) }),
    };
  }
};
