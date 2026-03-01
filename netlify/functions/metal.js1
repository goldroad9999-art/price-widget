// netlify/functions/metals.js
// ✅ 1회 호출로: USD/KRW + (XAUUSD/XAGUSD/XPTUSD 최근/전일) + KRW 환산값(원 변동 포함)
// ✅ 타임아웃 + 1회 재시도
// ✅ 서버 메모리 캐시 60초 + CDN 캐시 60초

const STOOQ = (symbol) => `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
const FX_URL = "https://open.er-api.com/v6/latest/USD";

const TIMEOUT_MS = 6500;
const RETRY_ONCE = true;

let MEM_CACHE = { ts: 0, data: null };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchRetry(url, options = {}) {
  try {
    return await fetchWithTimeout(url, options);
  } catch (e) {
    if (!RETRY_ONCE) throw e;
    // 짧게 기다렸다가 1회 재시도
    await sleep(250);
    return await fetchWithTimeout(url, options);
  }
}

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
  const r = await fetchRetry(FX_URL, { headers: { "user-agent": "netlify-function" } });
  const j = await r.json();
  const v = j?.rates?.KRW;
  if (!v) throw new Error("fx missing");
  return v;
}

async function fetchOneMetal(symbol) {
  const r = await fetchRetry(STOOQ(symbol), { headers: { "user-agent": "netlify-function" } });
  const csv = await r.text();
  return parseLatestPrevFromStooqCSV(csv);
}

exports.handler = async () => {
  try {
    const now = Date.now();

    // ✅ 60초 메모리 캐시
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

    // ✅ 동시 요청
    const [usdkrw, xau, xag, xpt] = await Promise.all([
      fetchFxUSDKRW(),
      fetchOneMetal("xauusd"),
      fetchOneMetal("xagusd"),
      fetchOneMetal("xptusd"),
    ]);

    // ✅ “오늘 환율” 기준으로 KRW 환산(원 변동 포함)
    // (퍼센트는 close/prev_close 기준이라 동일하지만, 원 단위 변동을 함께 제공하면 체감이 좋아짐)
    function addKrwFields(o) {
      const krw_close = o.close * usdkrw;
      const krw_prev_close = o.prev_close * usdkrw;
      const krw_change = krw_close - krw_prev_close;
      // krw_change_pct는 오늘 환율 기준이라 change_pct와 동일 (전일 환율 반영 %까지는 별도 소스 필요)
      return {
        ...o,
        krw_close,
        krw_prev_close,
        krw_change,
        krw_change_pct: o.change_pct,
      };
    }

    const data = {
      success: true,
      updated_at: new Date().toISOString(),
      usdkrw,
      metals: {
        xauusd: { symbol: "xauusd", ...addKrwFields(xau) },
        xagusd: { symbol: "xagusd", ...addKrwFields(xag) },
        xptusd: { symbol: "xptusd", ...addKrwFields(xpt) },
      },
    };

    MEM_CACHE = { ts: now, data };

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
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
