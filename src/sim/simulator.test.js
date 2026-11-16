import { describe, it, expect } from "vitest";
import { createSimulator, DEFAULT_STATIONS, rainExposure } from "./simulator.js";
import { SCENARIOS, truthAt, getScenario } from "./scenario.js";

const one = (scenarioId, opt = {}) =>
  createSimulator({
    stations: [{ id: "x", name: "x", lat: 0, lng: 0, real: false, scenarioId }],
    startTs: 0,
    loop: false,
    ...opt,
  });

/** 연속 중복 제거 */
const compress = (arr) => arr.filter((v, i) => i === 0 || v !== arr[i - 1]);

describe("scenario 정의", () => {
  it("시나리오 8종, 기본 지점마다 하나씩 배정", () => {
    expect(SCENARIOS).toHaveLength(8);
    const used = new Set(DEFAULT_STATIONS.map((s) => s.scenarioId));
    for (const s of SCENARIOS) expect(used.has(s.id)).toBe(true);
  });

  for (const sc of SCENARIOS) {
    it(`${sc.id}: 정답 상태 흐름이 expectStates와 일치`, () => {
      const seq = [];
      for (let sec = 0; sec < sc.durationMin * 60; sec += 10) seq.push(truthAt(sc, sec / 60));
      expect(compress(seq)).toEqual(sc.expectStates);
    });
  }
});

describe("simulator", () => {
  it("같은 seed면 같은 데이터", () => {
    const a = createSimulator({ seed: 7, startTs: 0 });
    const b = createSimulator({ seed: 7, startTs: 0 });
    for (let i = 0; i < 50; i++) expect(a.tick()).toEqual(b.tick());
  });

  it("tick마다 stepSec만큼 시간이 흐르고 모든 지점이 나온다", () => {
    const sim = createSimulator({ startTs: 1000, stepSec: 10 });
    const r1 = sim.tick();
    const r2 = sim.tick();
    expect(r1).toHaveLength(DEFAULT_STATIONS.length);
    expect(r1[0].now).toBe(1000);
    expect(r2[0].now).toBe(11000);
    expect(r1[0].sample).toMatchObject({ stationId: "st-1", ts: 1000 });
  });

  it("통신 두절 구간은 sample이 null", () => {
    const sim = one("commDrop");
    const got = [];
    for (let sec = 0; sec < 50 * 60; sec += 10) got.push([sec / 60, sim.tick()[0].sample]);
    for (const [t, s] of got) {
      if (t >= 20 && t < 35) expect(s).toBeNull();
      else expect(s).not.toBeNull();
    }
  });

  it("센서 이상: 음수와 측정 실패(null)가 그대로 전달", () => {
    const sim = one("sensorFault");
    const byMin = {};
    for (let sec = 0; sec < 50 * 60; sec += 10) byMin[sec / 60] = sim.tick()[0].sample;
    expect(byMin[20].weightG).toBe(-350);
    expect(byMin[37].weightG).toBeNull();
    expect(byMin[45].weightG).not.toBeNull(); // 복구 후 정상값
    expect(byMin[45].weightG).toBeGreaterThanOrEqual(0);
  });

  it("수거(collect) 후 중량이 0 근처로 떨어진다", () => {
    const sim = one("gradual");
    for (let i = 0; i < 80 * 6; i++) sim.tick(); // 80분
    const before = sim.tick()[0].sample;
    expect(before.weightG).toBeGreaterThan(1000); // 위험(총 1000g) 이상
    sim.collect("x");
    const after = sim.tick()[0].sample;
    expect(after.weightG).toBeLessThan(250); // 주의 기준 미만 (노이즈 σ40g 고려)
  });

  it("강우 수동 입력이 시나리오 값을 덮어쓴다", () => {
    const sim = one("normal");
    expect(sim.tick()[0].sample.rainMm).toBe(0);
    sim.setRain(12);
    expect(sim.tick()[0].sample.rainMm).toBe(12);
    sim.setRain(null);
    expect(sim.tick()[0].sample.rainMm).toBe(0);
  });

  it("loop면 시나리오가 끝난 뒤 처음부터 반복", () => {
    const sim = one("collect", { loop: true });
    const steps = (getScenario("collect").durationMin * 60) / 10;
    for (let i = 0; i < steps; i++) sim.tick();
    sim.tick();
    expect(sim.elapsedMin("x")).toBeCloseTo(10 / 60);
  });

  it("setScenario는 처음부터 재생", () => {
    const sim = one("normal");
    for (let i = 0; i < 30; i++) sim.tick();
    sim.setScenario("x", "collect");
    expect(sim.elapsedMin("x")).toBe(0);
    const s = sim.tick()[0].sample;
    expect(s.weightG).toBeGreaterThan(900); // collect 시나리오 시작 ≈1200g
  });
});

describe("날씨 비에 따른 추가 적재", () => {
  // 늘 비슷한 값인 normal 시나리오에 전체 강우를 걸어 비교 (노이즈는 같은 seed라 같다)
  const run = (rain, minutes = 20) => {
    const sim = one("normal", { seed: 7 });
    if (rain != null) sim.setRain(rain);
    let last;
    for (let i = 0; i < (minutes * 60) / sim.stepSec; i++) last = sim.tick()[0].sample;
    return { sim, w: last.weightG };
  };

  it("맑음 < 보통 비(5mm/h) < 호우(30mm/h)", () => {
    const dry = run(null).w;
    const light = run(5).w;
    const heavy = run(30).w;
    expect(light).toBeGreaterThan(dry + 50);
    expect(heavy).toBeGreaterThan(light + 400);
  });

  it("수거하면 비로 쌓인 것도 함께 치운다", () => {
    const { sim } = run(30);
    sim.collect("x");
    expect(sim.tick()[0].sample.weightG).toBeLessThan(250);
  });

  it("지점마다 노출 정도가 다르고 0.6~1.4 범위", () => {
    const ex = DEFAULT_STATIONS.map((s) => rainExposure(s.id));
    for (const e of ex) {
      expect(e).toBeGreaterThanOrEqual(0.6);
      expect(e).toBeLessThanOrEqual(1.4);
    }
    expect(new Set(ex.map((e) => e.toFixed(2))).size).toBeGreaterThan(10);
  });
});
