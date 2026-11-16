// 가상 센서 데이터 생성기 (기획서 5장).
// tick()마다 지점별 Sample(또는 수신 없음 = null)을 만든다. 같은 seed면 같은 데이터가 나온다.
// 실물 센서 데이터도 같은 Sample 포맷이므로, 판정·화면은 출처를 구분하지 않는다.

import { getScenario } from "./scenario.js";
import { MAP_CENTER } from "../config.js";

/** 시드 고정 난수 (0~1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 지점 좌표는 충북대 주변 임시값 (MAP_CENTER 기준 오프셋). 실제 빗물받이 위치가 아니며 지도로 확인 후 조정한다.
// 수거 경로(OSRM)는 각 좌표를 가장 가까운 도로에 붙여 계산하므로 도로에서 조금 벗어나도 동작한다.
const at = (dLat, dLng) => ({ lat: MAP_CENTER.lat + dLat, lng: MAP_CENTER.lng + dLng });

/**
 * 기본 지점: 실물 1 + 가상 14, 시나리오 8종을 모두 한 번 이상 배정.
 * startMin: 시나리오를 몇 분 지점부터 시작할지 (같은 시나리오 지점이 동시에 움직이지 않게)
 */
export const DEFAULT_STATIONS = [
  { id: "st-1", name: "빗물받이 #1 (실물)", real: true, scenarioId: "gradual", ...at(0, 0) },
  { id: "st-2", name: "빗물받이 #2", real: false, scenarioId: "normal", ...at(0.004, -0.006) },
  { id: "st-3", name: "빗물받이 #3", real: false, scenarioId: "plateau", ...at(-0.003, 0.007) },
  { id: "st-4", name: "빗물받이 #4", real: false, scenarioId: "rainSurge", ...at(0.006, 0.004) },
  { id: "st-5", name: "빗물받이 #5", real: false, scenarioId: "collect", ...at(-0.005, -0.004) },
  { id: "st-6", name: "빗물받이 #6", real: false, scenarioId: "commDrop", ...at(0.002, 0.011) },
  { id: "st-7", name: "빗물받이 #7", real: false, scenarioId: "sensorFault", ...at(-0.007, 0.002) },
  { id: "st-8", name: "빗물받이 #8", real: false, scenarioId: "spike", ...at(0.008, -0.002) },
  { id: "st-9", name: "빗물받이 #9", real: false, scenarioId: "normal", startMin: 20, ...at(0.0005, -0.0035) },
  { id: "st-10", name: "빗물받이 #10", real: false, scenarioId: "gradual", startMin: 35, ...at(0.01, 0.0075) },
  { id: "st-11", name: "빗물받이 #11", real: false, scenarioId: "rainSurge", startMin: 20, ...at(-0.009, -0.007) },
  { id: "st-12", name: "빗물받이 #12", real: false, scenarioId: "normal", startMin: 40, ...at(-0.006, 0.011) },
  { id: "st-13", name: "빗물받이 #13", real: false, scenarioId: "plateau", startMin: 20, ...at(0.0035, 0.0025) },
  { id: "st-14", name: "빗물받이 #14", real: false, scenarioId: "gradual", startMin: 55, ...at(-0.0105, 0.006) },
  { id: "st-15", name: "빗물받이 #15", real: false, scenarioId: "collect", startMin: 10, ...at(0.011, -0.008) },
];

const WEIGHT_NOISE_G = 40; // 하드웨어 오차 ±100g 가정 → 표준편차 40g (±100g ≈ 2.5σ), 총 중량 기준
const RSSI_NOISE = 2;
const BATTERY_DRAIN_PER_STEP = 0.002;

/**
 * @param {Object} [opt]
 * @param {Array}  [opt.stations] 지점 목록 (DEFAULT_STATIONS 형식)
 * @param {number} [opt.seed]     난수 시드
 * @param {number} [opt.startTs]  시작 시각 (epoch ms)
 * @param {number} [opt.stepSec]  샘플 간격 (시뮬레이션 초)
 * @param {boolean}[opt.loop]     시나리오가 끝나면 처음부터 반복
 */
export function createSimulator({
  stations = DEFAULT_STATIONS,
  seed = 42,
  startTs = Date.now(),
  stepSec = 10,
  loop = true,
} = {}) {
  const rng = mulberry32(seed);
  // 근사 정규분포 노이즈 (표준편차 ≈ sd)
  const noise = (sd) => (rng() + rng() + rng() - 1.5) * 2 * sd;

  let now = startTs;
  let rainOverride = null;

  const state = new Map(
    stations.map((s) => [
      s.id,
      {
        ...s,
        elapsedSec: (s.startMin ?? 0) * 60,
        offset: 0, // 수거(리셋) 시 빼는 값
        lastBase: 0,
        battery: 95 - rng() * 15,
      },
    ]),
  );

  function weight(raw, offset) {
    if (raw == null) return null; // 측정 실패
    if (raw < 0) return Math.round(raw); // 센서 이상값은 그대로
    return Math.max(0, Math.round(raw - offset + noise(WEIGHT_NOISE_G)));
  }

  /** @returns {import("../logic/types.js").Sample|null} */
  function makeSample(s, ts) {
    const sc = getScenario(s.scenarioId);
    if (loop && s.elapsedSec / 60 >= sc.durationMin) resetStation(s);
    const p = sc.at(s.elapsedSec / 60);

    s.battery = Math.max(0, s.battery - BATTERY_DRAIN_PER_STEP);
    if (p.weightG != null && p.weightG >= 0) s.lastBase = p.weightG;
    if (p.dropped) return null;

    return {
      stationId: s.id,
      ts,
      weightG: weight(p.weightG, s.offset),
      rainMm: rainOverride ?? p.rainMm ?? 0,
      rssi: Math.round((p.rssi ?? -55) + noise(RSSI_NOISE)),
      batteryPct: Math.round(s.battery),
    };
  }

  function resetStation(s) {
    s.elapsedSec = 0;
    s.offset = 0;
  }

  function get(id) {
    const s = state.get(id);
    if (!s) throw new Error(`unknown station: ${id}`);
    return s;
  }

  return {
    get now() {
      return now;
    },
    stepSec,

    /** 지점 정적 정보 */
    stations() {
      return [...state.values()].map(({ id, name, lat, lng, real, scenarioId }) => ({
        id, name, lat, lng, real, scenarioId,
      }));
    },

    /** 한 스텝 진행. 지점마다 { stationId, now, sample(null=수신 없음) } */
    tick() {
      const ts = now;
      const out = [];
      for (const s of state.values()) {
        out.push({ stationId: s.id, now: ts, sample: makeSample(s, ts) });
        s.elapsedSec += stepSec;
      }
      now += stepSec * 1000;
      return out;
    },

    /** 수거(리셋): 현재 쌓인 양을 빼서 0 근처로 만든다. 시나리오 흐름은 계속된다 */
    collect(id) {
      const s = get(id);
      s.offset = s.lastBase;
    },

    /** 강우 수동 입력 (mm/h). null이면 시나리오 값 사용 */
    setRain(mm) {
      rainOverride = mm;
    },

    get rainOverride() {
      return rainOverride;
    },

    /** 지점 시나리오 변경 (처음부터 재생) */
    setScenario(id, scenarioId) {
      getScenario(scenarioId); // 존재 확인
      const s = get(id);
      s.scenarioId = scenarioId;
      resetStation(s);
    },

    /** 지점의 현재 시나리오 진행 시간 (분) */
    elapsedMin(id) {
      return get(id).elapsedSec / 60;
    },
  };
}
