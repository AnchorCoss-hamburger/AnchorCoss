import { describe, it, expect } from "vitest";
import { countByState, sortByPriority, fmtAgo, fmtG, rssiLevel, toChartData, downsample, rainSegments, collectTargets, fmtDistance, fmtDuration, filterStations, fmtTime, sparkPath } from "./format.js";

describe("downsample", () => {
  const pt = (ts, total, rain = 0) => ({ ts, left: total == null ? null : total / 2, right: total == null ? null : total / 2, total, rain });

  it("점이 적으면 그대로", () => {
    const d = [pt(0, 1), pt(1, 2)];
    expect(downsample(d, 10)).toBe(d);
  });

  it("1초 간격 3600점 → 최대 400점, 구간 평균", () => {
    const d = Array.from({ length: 3600 }, (_, i) => pt(i * 1000, i));
    const r = downsample(d, 400);
    expect(r.length).toBeLessThanOrEqual(400);
    expect(r.length).toBeGreaterThan(390);
    expect(r[0].total).toBeCloseTo(4, 0); // 0~8 평균 근처
    expect(r.map((x) => x.ts)).toEqual([...r.map((x) => x.ts)].sort((a, b) => a - b));
  });

  it("통신 두절 구간(null)은 끊김으로 유지, 강우는 최대값", () => {
    const d = [
      ...Array.from({ length: 50 }, (_, i) => pt(i, 100, i === 10 ? 5 : 0)),
      ...Array.from({ length: 50 }, (_, i) => pt(50 + i, null)),
    ];
    const r = downsample(d, 10);
    expect(r.at(-1).total).toBeNull();
    expect(Math.max(...r.map((x) => x.rain))).toBe(5);
  });
});

describe("rssiLevel", () => {
  it("4단계", () => {
    expect([-50, -65, -75, -85, -95, null].map(rssiLevel)).toEqual([4, 3, 2, 1, 0, 0]);
  });
});

describe("toChartData / rainSegments", () => {
  const smp = (ts, leftG, rightG, rainMm = 0) => ({ ts, leftG, rightG, rainMm });

  it("합계 계산, 센서 이상값은 null", () => {
    const d = toChartData([smp(0, 100, 50), smp(10_000, 100, -300), smp(20_000, null, 50)]);
    expect(d.map((x) => x.total)).toEqual([150, null, null]);
    expect(d[1]).toMatchObject({ left: 100, right: null });
  });

  it("수신이 끊긴 구간에 null 점을 넣는다", () => {
    const d = toChartData([smp(0, 1, 1), smp(10_000, 1, 1), smp(600_000, 1, 1)]);
    expect(d).toHaveLength(4);
    expect(d[2].total).toBeNull();
  });

  it("강우 구간", () => {
    const d = [0, 0, 5, 5, 0, 5].map((rain, i) => ({ ts: i, rain }));
    expect(rainSegments(d, 1)).toEqual([{ from: 2, to: 3 }, { from: 5, to: 5 }]);
  });
});

const st = (name, state, score, flags = []) => ({ id: name, name, judgement: { state, score, flags } });

describe("countByState", () => {
  it("상태별 개수", () => {
    const c = countByState([st("a", "normal", 1), st("b", "danger", 90), st("c", "danger", 95), st("d", "check", null)]);
    expect(c).toEqual({ normal: 1, warn: 0, danger: 2, check: 1 });
  });
});

describe("sortByPriority", () => {
  it("점수 내림차순, 점검 필요는 맨 아래, 동점이면 우천 우선", () => {
    const list = [
      st("A", "check", null),
      st("B", "normal", 10),
      st("C", "danger", 100),
      st("D", "danger", 100, ["raining"]),
      st("E", "warn", 60),
    ];
    expect(sortByPriority(list).map((s) => s.name)).toEqual(["D", "C", "E", "B", "A"]);
  });

  it("원본 배열은 바꾸지 않는다", () => {
    const list = [st("B", "normal", 1), st("A", "normal", 2)];
    sortByPriority(list);
    expect(list[0].name).toBe("B");
  });
});

describe("fmtAgo / fmtG", () => {
  it("경과 시간", () => {
    expect(fmtAgo(100_000, 90_000)).toBe("방금");
    expect(fmtAgo(10 * 60_000, 0)).toBe("10분 전");
    expect(fmtAgo(3 * 3600_000, 0)).toBe("3시간 전");
    expect(fmtAgo(0, null)).toBe("수신 없음");
  });

  it("중량", () => {
    expect(fmtG(1234.4)).toBe("1,234g");
    expect(fmtG(null)).toBe("—");
  });
});

describe("수거 경로 도우미", () => {
  const st = (id, state) => ({ id, judgement: { state } });
  const list = [st("a", "normal"), st("b", "warn"), st("c", "danger"), st("d", "check")];

  it("collectTargets: 위험+주의, 점검 필요 제외", () => {
    expect(collectTargets(list).map((s) => s.id)).toEqual(["b", "c"]);
    expect(collectTargets(list, { includeWarn: false }).map((s) => s.id)).toEqual(["c"]);
  });

  it("fmtDistance / fmtDuration", () => {
    expect(fmtDistance(850.4)).toBe("850m");
    expect(fmtDistance(2449)).toBe("2.4km");
    expect(fmtDuration(20)).toBe("약 1분");
    expect(fmtDuration(720)).toBe("약 12분");
    expect(fmtDuration(3900)).toBe("약 1시간 5분");
    expect(fmtDuration(3600)).toBe("약 1시간");
  });
});

describe("filterStations", () => {
  const st = (id, real, state) => ({ id, real, judgement: { state } });
  const list = [st("r", true, "warn"), st("a", false, "warn"), st("b", false, "normal")];
  const ids = (o) => filterStations(list, o).map((s) => s.id);

  it("실물/가상/전체", () => {
    expect(ids({ source: "real" })).toEqual(["r"]);
    expect(ids({ source: "virtual" })).toEqual(["a", "b"]);
    expect(ids({})).toEqual(["r", "a", "b"]);
  });
  it("상태와 함께", () => {
    expect(ids({ source: "virtual", state: "warn" })).toEqual(["a"]);
    expect(ids({ state: "danger" })).toEqual([]);
  });
});

describe("fmtTime", () => {
  it("HH:MM:SS 두 자리", () => {
    expect(fmtTime(new Date(2026, 10, 16, 5, 2, 9).getTime())).toBe("05:02:09");
    expect(fmtTime(new Date(2026, 10, 16, 17, 30, 0).getTime())).toBe("17:30:00");
  });
});

describe("sparkPath", () => {
  const opt = { width: 100, height: 50, maxG: 1000 };
  it("시간·값을 좌표로 (아래가 0g)", () => {
    const r = sparkPath([{ ts: 0, total: 0 }, { ts: 10, total: 1000 }], opt);
    expect(r.line).toBe("M0,50L100,0");
    expect(r.area).toBe("M0,50L0,50L100,0L100,50Z");
  });
  it("null에서 선을 끊는다, 최대값을 넘으면 위쪽에 붙인다", () => {
    const r = sparkPath([{ ts: 0, total: 500 }, { ts: 5, total: null }, { ts: 10, total: 2000 }], opt);
    expect(r.line).toBe("M0,25M100,0");
  });
  it("값이 없으면 빈 경로", () => {
    expect(sparkPath([{ ts: 0, total: null }], opt)).toEqual({ line: "", area: "" });
  });
});
