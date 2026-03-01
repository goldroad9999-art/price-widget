// netlify/functions/metals.js
// 한 번 호출로: USD/KRW + XAUUSD/XAGUSD/XPTUSD(최근/전일) → KRW/돈 계산까지 가능하도록 데이터 제공
// 캐시: 60초(서버 메모리) + CDN 캐시(브라우저/엣지) 60초

const ALLOWED = ["xauusd", "xagusd", "xptusd"];
const STOOQ = (symbol) => `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
const FX_URL = "https://open.er-api.com/v6/latest/USD";

let MEM_CACHE = {
  ts: 0,
  data: null,
};

function parseLatestPrevFromStooqCSV(csvText) {
  const lines = (csvText || "").trim().split(/\r?\n/);
  if (lines.length < 3) throw new Error("not enough csv rows");

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

  const latest = rows[0];
  const prev = rows[1];

  const date = latest[0];
  const close = Number(latest[4]);
  const prev_date = prev[0];
  const prev_close = Number(prev[4]);

  if (!Number.isFinite(close) || close <= 0) throw new Error("invalid close");
  if (!Number.isFinite(prev_close) || prev_close <= 0) throw new Error("invalid prev_close");

  const change = close - prev_close;
  const change_pct = (change / prev_close) * 100;

  return { date, close, prev_date, prev_close, change, change_pct };
}

async function fetchFxUSDKRW() {
  const r = await fetch(FX_URL, { headers: { "user-agent": "netlify-function" } });
  const j = await r.json();
  const v = j?.rates?.KRW;
  if (!v) throw new Error("fx missing");
  return v;
}

async function fetchOneMetal(symbol) {
  const r = await fetch(STOOQ(symbol), { headers: { "user-agent": "netlify-function" } });
  const csv = await r.text();
  return parseLatestPrevFromStooqCSV(csv);
}

exports.handler = async () => {
  try {
    // ✅ 서버 메모리 캐시 (60초)
    const now = Date.now();
    if (MEM_CACHE.data && now - MEM_CACHE.ts < 60 * 1000) {
      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60",
          "x-cache": "HIT",
        },
        body: JSON.stringify(MEM_CACHE.data),
      };
    }

    // ✅ 환율 + 3종 금속 동시 요청
    const [usdkrw, xau, xag, xpt] = await Promise.all([
      fetchFxUSDKRW(),
      fetchOneMetal("xauusd"),
      fetchOneMetal("xagusd"),
      fetchOneMetal("xptusd"),
    ]);

    const data = {
      success: true,
      updated_at: new Date().toISOString(),
      usdkrw,
      metals: {
        xauusd: { symbol: "xauusd", ...xau },
        xagusd: { symbol: "xagusd", ...xag },
        xptusd: { symbol: "xptusd", ...xpt },
      },
    };

    MEM_CACHE = { ts: now, data };

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // ✅ 브라우저/엣지 캐시 60초 (트래픽 커질수록 효과 큼)
        "cache-control": "public, max-age=60",
        "x-cache": "MISS",
      },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ success: false, error: String(e?.message || e) }),
    };
  }
};
