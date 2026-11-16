// 상습 주의 구간용 최근 수거 기록 (가상).
// 실제 수거 기록은 아직 없으므로, 가상 지점마다 시나리오(쌓이는 속도)와 비 노출 정도로 30일치 일별 수거 횟수를 만든다.
// 지점 ID로 정해지는 시드를 써서 언제 열어도 같은 기록이 나온다. 화면에는 "가상 기록"이라고 밝힌다.
// 실물 지점은 기록 없음 (합동 테스트부터 실제 수거를 기록할 예정).

import { HOTSPOT } from "../config.js";
import { mulberry32, rainExposure } from "./simulator.js";

// 시나리오별 하루 평균 수거 횟수 (노출 정도를 곱함)
const DAILY_RATE = {
  normal: 0.1,
  gradual: 0.35,
  plateau: 0.25,
  rainSurge: 0.4,
  collect: 0.35,
  commDrop: 0.15,
  sensorFault: 0.15,
  spike: 0.1,
};

function seedOf(id) {
  let h = 2166136261;
  for (const c of `history:${id}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** 평균 lambda인 포아송 난수 (작은 lambda용) */
function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

const cache = new Map();

/**
 * 지점의 최근 수거 기록.
 * @param {{ id: string, real: boolean, scenarioId: string }} station
 * @returns {null | { daily: number[], total: number, hotspot: boolean, virtual: true }}
 *   daily: 오래된 날 → 오늘 순서 일별 수거 횟수 (HOTSPOT.DAYS개). 실물 지점은 null
 */
export function collectionHistory(station) {
  if (!station || station.real) return null;
  const key = `${station.id}:${station.scenarioId}`;
  if (cache.has(key)) return cache.get(key);
  const rng = mulberry32(seedOf(station.id));
  const lambda = (DAILY_RATE[station.scenarioId] ?? 0.2) * rainExposure(station.id);
  // 비 온 날(5일 중 1일꼴)에는 두 배로 자주 찬다
  const daily = Array.from({ length: HOTSPOT.DAYS }, () => poisson(rng, rng() < 0.2 ? lambda * 2 : lambda));
  const total = daily.reduce((a, b) => a + b, 0);
  const out = { daily, total, hotspot: total >= HOTSPOT.MIN_COLLECTIONS, virtual: true };
  cache.set(key, out);
  return out;
}
