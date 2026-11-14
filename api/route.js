// POST /api/route — 수거 경로 계산 (출발지 → 수거 대상 지점들 → 출발지, 방문 순서 최적화)
// 본문:  { depot: { lat, lng }, points: [{ id, lat, lng }, ...] }
// 응답:  { ok: true, source, order, path, distanceM, durationS, warning? }   (형식은 lib/route.js 참고)
//
// 1순위 OSRM(오픈스트리트맵 도로)으로 계산 → 받은 경로는 저장해 둔다.
// OSRM이 안 되면(인터넷 끊김·공개 서버 장애) 2순위 저장된 같은 경로, 3순위 직선 추정 경로로 응답한다.
// 공개 OSRM 서버는 시험용이라 느리거나 멈출 수 있다. 시연 전에 같은 흐름으로 한 번 돌려 두면 저장분이 쌓인다.
// 주소는 OSRM_URL 환경변수로 바꿀 수 있다 (직접 띄운 OSRM 서버 등).

import fs from "node:fs";
import path from "node:path";
import { readJson, HttpError } from "../server/http.js";
import { OSRM_DEFAULT_URL, buildTripUrl, parseTrip, routeKey, straightRoute, emptyRoute, validateRouteInput } from "../lib/route.js";

const TIMEOUT_MS = 8000;
const CACHE_LIMIT = 500;
const memory = new Map(); // key → Route (source "osrm")
let loadedFrom = null; // 파일 캐시를 읽어 온 경로

/** 저장 파일 위치. Vercel(읽기 전용)에서는 파일에 저장하지 않는다 */
function cacheFile() {
  if (process.env.VERCEL) return null;
  return process.env.ROUTE_CACHE_PATH || path.join("data", "route-cache.json");
}

function loadCache() {
  const file = cacheFile();
  if (!file || loadedFrom === file) return;
  loadedFrom = file;
  try {
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [k, v] of Object.entries(obj)) if (!memory.has(k)) memory.set(k, v);
  } catch {
    // 파일이 없거나 깨졌으면 빈 캐시로 시작
  }
}

function saveCache(key, route) {
  memory.delete(key);
  memory.set(key, route);
  while (memory.size > CACHE_LIMIT) memory.delete(memory.keys().next().value);
  const file = cacheFile();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(memory)));
  } catch (e) {
    console.warn("[route] 경로 저장 실패:", e.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POST만 지원합니다" });
  }

  let input;
  try {
    input = validateRouteInput(await readJson(req));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 400;
    return res.status(status).json({ ok: false, error: e.message });
  }
  const { depot, points } = input;
  if (!points.length) return res.status(200).json({ ok: true, ...emptyRoute() });

  loadCache();
  const key = routeKey(depot, points);
  const base = process.env.OSRM_URL || OSRM_DEFAULT_URL;

  try {
    const r = await fetch(buildTripUrl(base, depot, points), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    let json = null;
    try {
      json = await r.json();
    } catch {
      // 본문이 JSON이 아니면 아래에서 상태 코드로 처리
    }
    if (!r.ok && !json) throw new Error(`OSRM HTTP ${r.status}`);
    const route = parseTrip(json, points);
    saveCache(key, route);
    return res.status(200).json({ ok: true, ...route });
  } catch (e) {
    const reason = e.name === "TimeoutError" ? "응답 시간 초과" : e.message;
    const saved = memory.get(key);
    if (saved) {
      return res.status(200).json({ ok: true, ...saved, source: "cache", warning: `도로 경로 서버에 연결하지 못해 저장된 경로를 표시합니다 (${reason})` });
    }
    return res.status(200).json({
      ok: true,
      ...straightRoute(depot, points),
      warning: `도로 경로 서버에 연결하지 못해 직선으로 표시합니다 (${reason})`,
    });
  }
}

/** 테스트용: 캐시 비우기 */
export function _clearCache() {
  memory.clear();
  loadedFrom = null;
}
