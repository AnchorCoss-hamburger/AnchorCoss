// GET /api/weather[?lat=..&lng=..] — 기상청 초단기실황 프록시.
// 인증키(KMA_SERVICE_KEY)는 서버에서만 쓰고 브라우저로 보내지 않는다.
// 개발: vite.config.js의 devApi()가 연결 / 배포: Vercel이 서버 함수로 실행.
//
// 응답 200: { ok: true, region, lat, lng, nx, ny, baseDate, baseTime, rainMm, pty, ptyLabel, tempC, humidity, windMs, fetchedAt, cached?, stale?, warning?,
//            forecast: { baseDate, baseTime, hours: [{ ts, rainMm, pty }] } | null,   ← 초단기예보 (앞으로 6시간)
//            todayRainMm: number | null,                                           ← 오늘 누적 강수량
//            warnings: { tmFc, active: [{kind, areas}], preliminary: [{kind, when, areas}] } | null  ← 우리 지역 호우·태풍 특보
//            extraWarning? }   예보·누적 강수량은 실패해도 실황 응답은 그대로 준다 (extraWarning에 이유)
// 응답 4xx/5xx: { ok: false, error, code? }

import { fetchNcst, fetchFcst, fetchTodayRain, fetchPwnStatus, regionWarnings, latLngToGrid } from "../lib/kma.js";
import { REGION, WARNING } from "../src/config.js";

const TTL_MS = 10 * 60 * 1000; // 실황은 1시간 단위라 10분 캐시면 충분 (호출 수 제한 대비)
const cache = new Map(); // "nx,ny" → { at, data }
let latest = null; // 가장 최근에 받은 대상 지역(REGION) 실황
const rainByHour = new Map(); // 오늘 누적 강수량용 시각별 실황 강수량 (지난 시각 값은 바뀌지 않음)

/** 예보·오늘 누적 강수량 (각각 실패해도 나머지는 준다) */
async function extras({ key, nx, ny }) {
  const out = { forecast: null, todayRainMm: null, warnings: null };
  const warn = [];
  try {
    out.forecast = await fetchFcst({ key, nx, ny });
  } catch (e) {
    warn.push(`예보: ${e.message}`);
  }
  try {
    out.todayRainMm = await fetchTodayRain({ key, nx, ny, cache: rainByHour });
  } catch (e) {
    warn.push(`누적 강수량: ${e.message}`);
  }
  try {
    const s = await fetchPwnStatus({ key });
    out.warnings = { tmFc: s.tmFc, ...regionWarnings(s, { kinds: WARNING.KINDS, areaKeywords: WARNING.AREA_KEYWORDS }) };
  } catch (e) {
    warn.push(`특보: ${e.message}`);
  }
  if (warn.length) out.extraWarning = warn.join(" / ");
  return out;
}

/** 센서 수신 시 강우를 붙이기 위한 최신 실황 (1시간 넘게 지난 값은 쓰지 않음) */
export function peekLatestWeather() {
  if (!latest || Date.now() - latest.fetchedAt > 60 * 60 * 1000) return null;
  return latest;
}

export default async function handler(req, res) {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) {
    return res.status(500).json({ ok: false, error: "KMA_SERVICE_KEY가 설정되지 않았습니다 (.env.local 확인)" });
  }

  const q = new URL(req.url ?? "/", "http://localhost").searchParams;
  const lat = Number(q.get("lat") ?? REGION.lat);
  const lng = Number(q.get("lng") ?? REGION.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return res.status(400).json({ ok: false, error: "위치(lat, lng)가 없습니다 (src/config.js의 REGION 확인)" });
  }

  const { nx, ny } = latLngToGrid(lat, lng);
  const ck = `${nx},${ny}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return res.status(200).json({ ...hit.data, cached: true });
  }

  try {
    const w = await fetchNcst({ key, nx, ny });
    const data = { ok: true, region: REGION.name, lat, lng, ...w, ...(await extras({ key, nx, ny })), fetchedAt: Date.now() };
    cache.set(ck, { at: Date.now(), data });
    if (lat === REGION.lat && lng === REGION.lng) latest = data;
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=300");
    return res.status(200).json(data);
  } catch (e) {
    // 직전에 받은 값이 있으면 그걸로 응답 (화면이 갑자기 비지 않게)
    if (hit) return res.status(200).json({ ...hit.data, stale: true, warning: e.message });
    return res.status(502).json({ ok: false, error: e.message, code: e.code ?? null });
  }
}

/** 테스트용: 캐시 비우기 */
export function _clearCache() {
  cache.clear();
  rainByHour.clear();
  latest = null;
}
