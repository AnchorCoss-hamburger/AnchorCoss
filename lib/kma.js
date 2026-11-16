// 기상청 단기예보 조회서비스 — 초단기실황(getUltraSrtNcst) 호출·파싱.
// 서버(api/weather.js)에서만 쓴다. 인증키가 브라우저로 나가지 않게 하기 위함.
//
// 쓰는 값: RN1(1시간 강수량 mm) → 판정의 강우량(mm/h), PTY(강수 형태), T1H(기온), REH(습도), WSD(풍속)
// 제공 시각: 매시 정각 관측, 매시 40분 이후 조회 가능 → 40분 전이면 한 시간 전 자료를 요청한다.

const NCST_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";

export class KmaError extends Error {
  constructor(code, message) {
    super(`기상청 API 오류(${code}): ${message}`);
    this.code = code;
  }
}

/**
 * 위경도 → 기상청 격자(nx, ny). 기상청 공식 Lambert Conformal Conic 변환식.
 * 격자 1칸 = 5km.
 */
export function latLngToGrid(lat, lng) {
  const RE = 6371.00877; // 지구 반경 (km)
  const GRID = 5.0; // 격자 간격 (km)
  const SLAT1 = 30.0; // 표준위도 1
  const SLAT2 = 60.0; // 표준위도 2
  const OLON = 126.0; // 기준점 경도
  const OLAT = 38.0; // 기준점 위도
  const XO = 43; // 기준점 X 격자
  const YO = 136; // 기준점 Y 격자

  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * D;
  const slat2 = SLAT2 * D;
  const olon = OLON * D;
  const olat = OLAT * D;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

const pad = (n) => String(n).padStart(2, "0");

/** 조회할 실황 기준 시각 (KST). 40분 전이면 한 시간 전. hoursBack으로 더 이전 시각 요청 */
export function ncstBaseTime(now = Date.now(), hoursBack = 0) {
  const kst = new Date(now + 9 * 3600e3);
  if (kst.getUTCMinutes() < 40) kst.setUTCHours(kst.getUTCHours() - 1);
  if (hoursBack) kst.setUTCHours(kst.getUTCHours() - hoursBack);
  return {
    baseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    baseTime: `${pad(kst.getUTCHours())}00`,
  };
}

export function buildNcstUrl({ key, nx, ny, baseDate, baseTime }) {
  const url = new URL(NCST_URL);
  url.searchParams.set("serviceKey", key); // Decoding 키를 넣으면 URLSearchParams가 인코딩한다
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));
  return url;
}

/** 초단기실황 강수 형태 코드 */
export const PTY_LABEL = {
  0: "강수 없음",
  1: "비",
  2: "비/눈",
  3: "눈",
  5: "빗방울",
  6: "빗방울/눈날림",
  7: "눈날림",
};

/**
 * 강수량 문자열 → mm. 실황은 보통 숫자("0", "1.5")지만 예보형 문자열도 방어적으로 처리.
 * "강수없음" → 0, "1mm 미만" → 0.5, "30.0~50.0mm" → 30, "50.0mm 이상" → 50
 */
export function parseRainMm(v) {
  if (v == null || v === "" || /없음/.test(String(v))) return 0;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  if (n < 0) return 0; // 결측(-998.9 등)
  return /미만/.test(String(v)) ? n / 2 : n;
}

const num = (v) => (v == null || v === "" || Number(v) <= -900 ? null : Number(v));

/** 응답 본문(text) → 정리된 실황 값. 오류면 KmaError */
export function parseNcst(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    // 인증키 오류 등은 JSON 요청이어도 XML로 온다
    const code = text.match(/<returnReasonCode>([^<]+)/)?.[1] ?? text.match(/<resultCode>([^<]+)/)?.[1] ?? "XML";
    const msg =
      text.match(/<returnAuthMsg>([^<]+)/)?.[1] ??
      text.match(/<resultMsg>([^<]+)/)?.[1] ??
      text.match(/<errMsg>([^<]+)/)?.[1] ??
      "JSON이 아닌 응답";
    throw new KmaError(code, msg);
  }
  const h = j?.response?.header;
  if (!h) throw new KmaError("FORMAT", "응답 형식이 예상과 다릅니다");
  if (h.resultCode !== "00") throw new KmaError(h.resultCode, h.resultMsg);

  const items = j.response.body?.items?.item ?? [];
  if (!items.length) throw new KmaError("03", "NO_DATA");
  const v = Object.fromEntries(items.map((it) => [it.category, it.obsrValue]));
  const pty = Number(v.PTY ?? 0);
  return {
    baseDate: items[0].baseDate,
    baseTime: items[0].baseTime,
    nx: items[0].nx,
    ny: items[0].ny,
    rainMm: parseRainMm(v.RN1),
    pty,
    ptyLabel: PTY_LABEL[pty] ?? `코드 ${pty}`,
    tempC: num(v.T1H),
    humidity: num(v.REH),
    windMs: num(v.WSD),
  };
}

/**
 * 초단기실황 조회. 해당 시각 자료가 아직 없으면(NO_DATA) 한 시간 전으로 한 번 더 시도한다.
 * @param {{ key: string, nx: number, ny: number, now?: number, fetchImpl?: typeof fetch }} opt
 */
export async function fetchNcst({ key, nx, ny, now = Date.now(), fetchImpl = fetch }) {
  let lastErr;
  for (let back = 0; back < 2; back++) {
    const base = ncstBaseTime(now, back);
    const res = await fetchImpl(buildNcstUrl({ key, nx, ny, ...base }));
    if (!res.ok) throw new KmaError(`HTTP${res.status}`, "기상청 서버 응답 오류");
    try {
      return parseNcst(await res.text());
    } catch (e) {
      lastErr = e;
      if (!(e instanceof KmaError) || e.code !== "03") throw e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 초단기예보(getUltraSrtFcst): 앞으로 6시간 1시간 단위 예보. 비 예보 기반 사전 수거 권고에 쓴다.
// 제공 시각: 매시 30분 발표, 매시 45분 이후 조회 가능 → 45분 전이면 한 시간 전 발표분을 요청한다.
// 쓰는 값: RN1(1시간 강수량, "강수없음"·"1mm 미만"·"1.0mm"·"30.0~50.0mm" 같은 문자열), PTY(강수 형태)

const FCST_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst";

/** 조회할 초단기예보 발표 시각 (KST, HH30) */
export function fcstBaseTime(now = Date.now(), hoursBack = 0) {
  const kst = new Date(now + 9 * 3600e3);
  if (kst.getUTCMinutes() < 45) kst.setUTCHours(kst.getUTCHours() - 1);
  if (hoursBack) kst.setUTCHours(kst.getUTCHours() - hoursBack);
  return {
    baseDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    baseTime: `${pad(kst.getUTCHours())}30`,
  };
}

export function buildFcstUrl({ key, nx, ny, baseDate, baseTime }) {
  const url = buildNcstUrl({ key, nx, ny, baseDate, baseTime });
  return new URL(`${FCST_URL}?${url.searchParams.toString().replace("numOfRows=10", "numOfRows=60")}`);
}

/** "20261116", "1500" (KST) → epoch ms */
export function kstToTs(date, time) {
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  const h = Number(String(time).slice(0, 2));
  const mi = Number(String(time).slice(2, 4) || 0);
  return Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600e3;
}

/** 응답 본문 → items (오류면 KmaError). 실황·예보 공통 */
function parseItems(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    const code = text.match(/<returnReasonCode>([^<]+)/)?.[1] ?? text.match(/<resultCode>([^<]+)/)?.[1] ?? "XML";
    const msg = text.match(/<returnAuthMsg>([^<]+)/)?.[1] ?? text.match(/<resultMsg>([^<]+)/)?.[1] ?? "JSON이 아닌 응답";
    throw new KmaError(code, msg);
  }
  const h = j?.response?.header;
  if (!h) throw new KmaError("FORMAT", "응답 형식이 예상과 다릅니다");
  if (h.resultCode !== "00") throw new KmaError(h.resultCode, h.resultMsg);
  const items = j.response.body?.items?.item ?? [];
  if (!items.length) throw new KmaError("03", "NO_DATA");
  return items;
}

/**
 * 초단기예보 응답 → { baseDate, baseTime, hours: [{ ts, rainMm, pty }] } (시각 오름차순)
 * ts는 그 1시간이 시작하는 시각 (fcstTime 15:00 → 15:00~16:00 예보)
 */
export function parseFcst(text) {
  const items = parseItems(text);
  const byTime = new Map();
  for (const it of items) {
    const k = `${it.fcstDate}${it.fcstTime}`;
    if (!byTime.has(k)) byTime.set(k, { ts: kstToTs(it.fcstDate, it.fcstTime), rainMm: 0, pty: 0 });
    const h = byTime.get(k);
    if (it.category === "RN1") h.rainMm = parseRainMm(it.fcstValue);
    if (it.category === "PTY") h.pty = Number(it.fcstValue) || 0;
  }
  return {
    baseDate: items[0].baseDate,
    baseTime: items[0].baseTime,
    hours: [...byTime.values()].sort((a, b) => a.ts - b.ts),
  };
}

/** 초단기예보 조회. 아직 발표 전이면(NO_DATA) 한 시간 전 발표분으로 한 번 더 */
export async function fetchFcst({ key, nx, ny, now = Date.now(), fetchImpl = fetch }) {
  let lastErr;
  for (let back = 0; back < 2; back++) {
    const res = await fetchImpl(buildFcstUrl({ key, nx, ny, ...fcstBaseTime(now, back) }));
    if (!res.ok) throw new KmaError(`HTTP${res.status}`, "기상청 서버 응답 오류");
    try {
      return parseFcst(await res.text());
    } catch (e) {
      lastErr = e;
      if (!(e instanceof KmaError) || e.code !== "03") throw e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 오늘 누적 강수량: 초단기실황 RN1(직전 1시간 강수량)을 오늘 01시~가장 최근 관측 시각까지 더한다.
// (00시 관측은 어제 23~24시 강수라 뺀다) 지난 시각 값은 바뀌지 않으므로 시각별로 저장해 두고 재사용한다.

/** 오늘 합산할 실황 관측 시각 목록 (KST 01시 ~ 가장 최근 관측 시각) */
export function todayNcstBases(now = Date.now()) {
  const latest = ncstBaseTime(now);
  const today = new Date(now + 9 * 3600e3);
  const todayDate = `${today.getUTCFullYear()}${pad(today.getUTCMonth() + 1)}${pad(today.getUTCDate())}`;
  if (latest.baseDate !== todayDate) return []; // 00시 40분 전 등 아직 오늘 관측 없음
  const last = Number(latest.baseTime.slice(0, 2));
  const out = [];
  for (let h = 1; h <= last; h++) out.push({ baseDate: todayDate, baseTime: `${pad(h)}00` });
  return out;
}

/**
 * 오늘 누적 강수량(mm). cache: Map("날짜시각" → mm) — 호출한 쪽이 계속 들고 있으면 새 시각만 조회한다.
 * 한 시각이라도 실패하면 예외 (부분 합계를 보여 주지 않음).
 */
export async function fetchTodayRain({ key, nx, ny, now = Date.now(), fetchImpl = fetch, cache = new Map() }) {
  const bases = todayNcstBases(now);
  const missing = bases.filter((b) => !cache.has(`${nx},${ny},${b.baseDate}${b.baseTime}`));
  // 한꺼번에 많이 부르지 않게 4개씩
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(
      missing.slice(i, i + 4).map(async (b) => {
        const res = await fetchImpl(buildNcstUrl({ key, nx, ny, ...b }));
        if (!res.ok) throw new KmaError(`HTTP${res.status}`, "기상청 서버 응답 오류");
        cache.set(`${nx},${ny},${b.baseDate}${b.baseTime}`, parseNcst(await res.text()).rainMm);
      }),
    );
  }
  const sum = bases.reduce((s, b) => s + cache.get(`${nx},${ny},${b.baseDate}${b.baseTime}`), 0);
  return Math.round(sum * 10) / 10;
}
