// 가상 시나리오 정의 (기획서 5장).
// at(tMin): 노이즈 없는 기준값을 돌려준다. 노이즈는 simulator.js가 더한다.
// truth(tMin): 그 시각의 정답 상태 (ground truth). 판정 정확도 측정에 쓴다 (기획서 4.7).
// expectStates / expectFlags: 판정 로직이 보여야 하는 상태 흐름·플래그 (3단계 테스트용).
// 값은 총 중량 하나(weightG). 로드셀 2개를 HX711 하나로 합쳐 읽으므로 좌/우 구분이 없다.
// 무게 범위는 하드웨어 기준(주의 250 / 2단계 500 / 위험·수거 1000g)에 맞춘다.

import { TH } from "../config.js";
import { STATES, FLAGS } from "../logic/states.js";

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, x) => a + (b - a) * clamp01(x);

/** 디바운싱·히스테리시스 없이 임계값만으로 본 "이상적인" 상태 */
export function truthFromWeight(weightG) {
  if (weightG == null || weightG < 0 || weightG > TH.MAX_VALID_G) return STATES.CHECK;
  if (weightG >= TH.DANGER_TOTAL_G) return STATES.DANGER;
  if (weightG >= TH.WARN_TOTAL_G) return STATES.WARN;
  return STATES.NORMAL;
}

export const SCENARIOS = [
  {
    id: "normal",
    name: "정상",
    description: "낮은 값 유지, 소폭 변동",
    durationMin: 60,
    at: (t) => ({ weightG: 110 + 20 * Math.sin(t / 7) + 15 * Math.cos(t / 9), rainMm: 0 }),
    expectStates: [STATES.NORMAL],
    expectFlags: [],
  },
  {
    id: "gradual",
    name: "서서히 누적",
    description: "선형 증가 → 주의(≈14분) → 위험(≈68분)",
    durationMin: 100,
    at: (t) => ({ weightG: lerp(50, 1300, t / 90), rainMm: 0 }),
    expectStates: [STATES.NORMAL, STATES.WARN, STATES.DANGER],
    expectFlags: [],
  },
  {
    id: "plateau",
    name: "중간 적재",
    description: "30분 동안 600g까지 증가 후 유지 → 주의(2단계)에서 머무름",
    durationMin: 70,
    at: (t) => ({ weightG: lerp(60, 600, t / 30), rainMm: 0 }),
    expectStates: [STATES.NORMAL, STATES.WARN],
    expectFlags: [],
  },
  {
    id: "rainSurge",
    name: "우천 급증",
    description: "10~40분 강우(15mm/h) 동안 분당 50g씩 증가",
    durationMin: 55,
    at: (t) => {
      const raining = t >= 10 && t < 40;
      return { weightG: t < 10 ? 100 : 100 + 50 * (Math.min(t, 40) - 10), rainMm: raining ? 15 : 0 };
    },
    expectStates: [STATES.NORMAL, STATES.WARN, STATES.DANGER],
    expectFlags: [FLAGS.RAINING, FLAGS.FAST],
  },
  {
    id: "collect",
    name: "수거 후 복구",
    description: "위험 상태에서 20분에 수거 → 정상 복귀",
    durationMin: 40,
    at: (t) => ({ weightG: t < 20 ? lerp(1200, 1300, t / 20) : 40 + (t - 20) * 2, rainMm: 0 }),
    expectStates: [STATES.DANGER, STATES.NORMAL],
    expectFlags: [],
  },
  {
    id: "commDrop",
    name: "통신 두절",
    description: "12분부터 신호 약화, 20~35분 수신 없음 → 점검 필요 → 복귀",
    durationMin: 50,
    at: (t) => {
      let rssi = -55;
      if (t >= 12 && t < 20) rssi = lerp(-55, -92, (t - 12) / 8);
      else if (t >= 35) rssi = -60;
      return { weightG: 130, rainMm: 0, rssi, dropped: t >= 20 && t < 35 };
    },
    // 마지막 수신(20분) 후 STALE_SEC(5분)이 지나야 점검 필요
    truth: (t) => (t >= 20 + TH.STALE_SEC / 60 && t < 35 ? STATES.CHECK : STATES.NORMAL),
    expectStates: [STATES.NORMAL, STATES.CHECK, STATES.NORMAL],
    expectFlags: [],
  },
  {
    id: "sensorFault",
    name: "센서 이상",
    description: "15~30분 음수값, 35~40분 측정 실패(값 없음)",
    durationMin: 50,
    at: (t) => {
      let weightG = 140;
      if (t >= 15 && t < 30) weightG = -350;
      else if (t >= 35 && t < 40) weightG = null;
      return { weightG, rainMm: 0 };
    },
    expectStates: [STATES.NORMAL, STATES.CHECK, STATES.NORMAL, STATES.CHECK, STATES.NORMAL],
    expectFlags: [],
  },
  {
    id: "spike",
    name: "노이즈/충격",
    description: "10분 +600g, 20·30분 +300g 순간 스파이크 (샘플 1개)",
    durationMin: 40,
    at: (t) => {
      // 샘플 1개(10초)만 걸리도록 0.1분 폭
      const hit = (m) => t >= m && t < m + 0.1;
      let bump = 0;
      if (hit(10)) bump = 600; // MAX_JUMP_G(450) 초과 → 이상치 필터 확인
      if (hit(20) || hit(30)) bump = 300; // 필터 미만이지만 주의 기준(250) 초과 → 디바운싱 확인
      return { weightG: 130 + bump, rainMm: 0 };
    },
    truth: () => STATES.NORMAL,
    expectStates: [STATES.NORMAL],
    expectFlags: [],
  },
];

export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);

export function getScenario(id) {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario: ${id}`);
  return s;
}

/** 시나리오의 tMin 시각 정답 상태 */
export function truthAt(scenario, tMin) {
  if (scenario.truth) return scenario.truth(tMin);
  return truthFromWeight(scenario.at(tMin).weightG);
}
