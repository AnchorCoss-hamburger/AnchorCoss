import { describe, it, expect } from "vitest";
import { collectionHistory } from "./history.js";
import { DEFAULT_STATIONS } from "./simulator.js";
import { HOTSPOT } from "../config.js";

describe("상습 주의 구간용 수거 기록", () => {
  it("가상 지점은 30일 일별 기록, 실물 지점은 없음", () => {
    const real = DEFAULT_STATIONS.find((s) => s.real);
    expect(collectionHistory(real)).toBeNull();
    const h = collectionHistory(DEFAULT_STATIONS.find((s) => !s.real));
    expect(h.daily).toHaveLength(HOTSPOT.DAYS);
    expect(h.total).toBe(h.daily.reduce((a, b) => a + b, 0));
    expect(h.virtual).toBe(true);
  });

  it("같은 지점은 늘 같은 기록 (새로고침해도 바뀌지 않음)", () => {
    const s = DEFAULT_STATIONS[5];
    expect(collectionHistory({ ...s })).toEqual(collectionHistory({ ...s }));
  });

  it("빨리 쌓이는 시나리오가 더 자주 수거되고, 상습은 일부 지점만", () => {
    const virt = DEFAULT_STATIONS.filter((s) => !s.real);
    const avg = (id) => {
      const xs = virt.filter((s) => s.scenarioId === id).map((s) => collectionHistory(s).total);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(avg("gradual")).toBeGreaterThan(avg("normal"));
    const hot = virt.filter((s) => collectionHistory(s).hotspot).length;
    expect(hot).toBeGreaterThan(0);
    expect(hot).toBeLessThan(virt.length / 3);
  });
});
