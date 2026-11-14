// 수거 경로 계산 도우미 (서버 api/route.js와 화면이 함께 쓰는 순수 함수)
//
// 경로 결과 형식 (Route):
//   { source, order, path, distanceM, durationS }
//   source     "osrm"(실제 도로) | "cache"(저장된 도로 경로) | "straight"(직선 추정) | "empty"(대상 없음)
//   order      방문 순서대로 지점 id 배열 (출발지 제외)
//   path       지도에 그릴 선 [[lat, lng], ...] (출발지 → 지점들 → 출발지)
//   distanceM  총 거리 (m)
//   durationS  총 이동 시간 (초)
//
// 지점(point) 형식: { id, lat, lng }

import { ROUTE } from "../src/config.js";

export const OSRM_DEFAULT_URL = "https://router.project-osrm.org";

const EARTH_R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

/** 두 위경도 사이 직선 거리 (m) */
export function haversineM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

/**
 * 직선 대체 경로: 출발지에서 가장 가까운 지점부터 차례로 방문하고 출발지로 돌아온다 (최근접 이웃).
 * 도로 경로를 받지 못했을 때만 쓴다. 거리는 직선이라 실제보다 짧다.
 */
export function straightRoute(depot, points, speedKmh = ROUTE.STRAIGHT_SPEED_KMH) {
  if (!points.length) return emptyRoute();
  const left = [...points];
  const order = [];
  const path = [[depot.lat, depot.lng]];
  let cur = depot;
  let distanceM = 0;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (haversineM(cur, left[i]) < haversineM(cur, left[best])) best = i;
    }
    const next = left.splice(best, 1)[0];
    distanceM += haversineM(cur, next);
    order.push(next.id);
    path.push([next.lat, next.lng]);
    cur = next;
  }
  distanceM += haversineM(cur, depot);
  path.push([depot.lat, depot.lng]);
  return {
    source: "straight",
    order,
    path,
    distanceM: Math.round(distanceM),
    durationS: Math.round(distanceM / ((speedKmh * 1000) / 3600)),
  };
}

export function emptyRoute() {
  return { source: "empty", order: [], path: [], distanceM: 0, durationS: 0 };
}

const coord = (p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

/**
 * OSRM trip(순회 경로 최적화) 요청 주소. 첫 좌표(출발지)에서 출발해 출발지로 돌아온다.
 * https://project-osrm.org/docs/v5.24.0/api/#trip-service
 */
export function buildTripUrl(base, depot, points) {
  const coords = [depot, ...points].map(coord).join(";");
  return `${base.replace(/\/$/, "")}/trip/v1/driving/${coords}?source=first&roundtrip=true&overview=full&geometries=geojson`;
}

/** OSRM trip 응답 → Route. 형식이 다르면 Error */
export function parseTrip(json, points) {
  if (!json || json.code !== "Ok") throw new Error(`OSRM 응답 오류: ${json?.code ?? "형식 없음"}${json?.message ? ` (${json.message})` : ""}`);
  const trip = json.trips?.[0];
  const wps = json.waypoints;
  if (!trip || !Array.isArray(wps) || wps.length !== points.length + 1) throw new Error("OSRM 응답 형식이 예상과 다릅니다");
  // waypoints[i]는 입력 i번째 좌표 (0 = 출발지). waypoint_index = 방문 순서
  const order = points
    .map((p, i) => ({ id: p.id, idx: wps[i + 1].waypoint_index }))
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.id);
  const path = (trip.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng]);
  return {
    source: "osrm",
    order,
    path,
    distanceM: Math.round(trip.distance),
    durationS: Math.round(trip.duration),
  };
}

/** 같은 출발지·지점 묶음이면 같은 키 (지점 순서와 무관) */
export function routeKey(depot, points) {
  const ps = points.map((p) => `${p.id}@${coord(p)}`).sort();
  return [coord(depot), ...ps].join("|");
}

/** 요청 본문 검증 → { depot, points }. 잘못되면 Error(message) */
export function validateRouteInput(body, maxPoints = ROUTE.MAX_POINTS) {
  const okPt = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  if (!body || !okPt(body.depot)) throw new Error("출발지(depot) 좌표가 올바르지 않습니다");
  if (!Array.isArray(body.points)) throw new Error("points 배열이 필요합니다");
  if (body.points.length > maxPoints) throw new Error(`지점은 최대 ${maxPoints}개까지 계산합니다`);
  const ids = new Set();
  for (const p of body.points) {
    if (!okPt(p) || typeof p.id !== "string" || !p.id) throw new Error("지점 형식이 올바르지 않습니다 ({ id, lat, lng })");
    if (ids.has(p.id)) throw new Error(`지점 id가 중복됩니다: ${p.id}`);
    ids.add(p.id);
  }
  return {
    depot: { lat: body.depot.lat, lng: body.depot.lng },
    points: body.points.map(({ id, lat, lng }) => ({ id, lat, lng })),
  };
}
