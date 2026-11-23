import { describe, it, expect } from "vitest";
import { replayCompare, truthAtTs } from "./replay.js";
import { mulberry32 } from "../sim/simulator.js";

const S = 1000;
// 실측처럼 1초 간격, 오차 ±100g 정도의 기록
function record(parts, seed = 3) {
  const rng = mulberry32(seed);
  const noise = () => (rng() + rng() + rng() - 1.5) * 80;
  const out = [];
  let t = 0;
  for (const { sec, w } of parts) {
    for (let i = 0; i < sec; i++, t += S) out.push({ ts: t, weightG: typeof w === "function" ? w(i) : Math.max(0, w + noise()) });
  }
  return out;
}

describe("실측 비교 (replayCompare)", () => {
  it("정답 구간 안 시각만 정답이 있다", () => {
    const seg = [{ from: 10 * S, to: 20 * S, weightG: 300 }];
    expect(truthAtTs(5 * S, seg)).toBeNull();
    expect(truthAtTs(15 * S, seg)).toBe("warn");
  });

  it("기준선(250g) 근처 무게: 단순 방식은 깜빡이고 우리 방식은 안정적", () => {
    const samples = record([{ sec: 300, w: 255 }]);
    const { summary } = replayCompare(samples, [{ from: 0, to: 300 * S, weightG: 255 }]);
    expect(summary.changesBaseline).toBeGreaterThan(10);
    expect(summary.changesJudge).toBeLessThanOrEqual(1);
    expect(summary.falseBaseline).toBeGreaterThan(summary.falseJudge);
    expect(summary.accJudge).toBeGreaterThan(summary.accBaseline);
  });

  it("순간 충격(2초)은 우리 방식에서 상태가 바뀌지 않는다", () => {
    const samples = record([
      { sec: 60, w: 50 },
      { sec: 2, w: 900 },
      { sec: 60, w: 50 },
    ]);
    const { summary } = replayCompare(samples, [{ from: 0, to: 200 * S, weightG: 50 }]);
    expect(summary.changesJudge).toBe(0);
    expect(summary.changesBaseline).toBeGreaterThan(0);
  });

  it("정답 구간이 없으면 변경 횟수만", () => {
    const { summary } = replayCompare(record([{ sec: 30, w: 50 }]));
    expect(summary.covered).toBe(0);
    expect(summary.accJudge).toBeNull();
    expect(summary.falseBaseline).toBeNull();
    expect(summary.changesJudge).toBe(0);
  });
});
