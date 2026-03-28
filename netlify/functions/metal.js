const { getStore } = require("@netlify/blobs");

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
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: `invalid symbol: ${rawSymbol}` }),
      };
    }

    // 1) 현재가 조회
    const url = `https://api.gold-api.com/price/${apiSymbol}`;
    const r = await fetch(url, {
      headers: {
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; NetlifyFunction/1.0)",
      },
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

    // 2) 한국 날짜 기준으로 일자 관리
    const todayKST = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // YYYY-MM-DD

    // 3) Blobs 저장소
    const store = getStore({ name: "metal-history", consistency: "strong" });

    const key = `daily:${apiSymbol}`;
    const savedRaw = await store.get(key, { consistency: "strong" });

    let saved = {
      current: null,
      prev: null,
    };

    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw);
        if (parsed && typeof parsed === "object") {
          saved = {
            current: parsed.current || null,
            prev: parsed.prev || null,
          };
        }
      } catch (e) {
        // 저장 데이터가 깨졌으면 새로 시작
      }
    }

    // 4) 오늘/이전값 갱신
    if (!saved.current) {
      // 첫 실행
      saved.current = {
        date: todayKST,
        close,
      };
    } else if (saved.current.date !== todayKST) {
      // 날짜가 바뀌면 current -> prev 로 넘기고 오늘값 저장
      saved.prev = saved.current;
      saved.current = {
        date: todayKST,
        close,
      };
    } else {
      // 같은 날이면 오늘값만 최신 가격으로 업데이트
      saved.current.close = close;
    }

    await store.set(key, JSON.stringify(saved));

    // 5) 변화율 계산
    const prevClose = Number(saved?.prev?.close);
    const hasPrev = Number.isFinite(prevClose) && prevClose > 0;

    const change = hasPrev ? close - prevClose : null;
    const change_pct = hasPrev ? (change / prevClose) * 100 : null;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        symbol: rawSymbol.toLowerCase(),
        date: saved?.current?.date || todayKST,
        close,
        prev_date: saved?.prev?.date || null,
        prev_close: hasPrev ? prevClose : null,
        change,
        change_pct,
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
