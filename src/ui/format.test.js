import { describe, it, expect } from "vitest";
import { countByState, sortByPriority, fmtAgo, fmtG, rssiLevel, toChartData, downsample, rainSegments, collectTargets, fmtDistance, fmtDuration, filterStations, fmtTime, sparkPath, fmtStage, etaToDanger, stateDurations, rainFillRates, forecastLine, nextRain, stateSegments , timeTicks, fmtTick, shownWeight } from "./format.js";

describe("downsample", () => {
  const pt = (ts, total, rain = 0) => ({ ts, total, rain });

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
  const smp = (ts, weightG, rainMm = 0) => ({ ts, weightG, rainMm });

  it("총 중량, 센서 이상값(음수·null·범위 초과)은 null", () => {
    const d = toChartData([smp(0, 150), smp(10_000, -300), smp(20_000, null), smp(30_000, 9000)], { maxG: 2400 });
    expect(d.map((x) => x.total)).toEqual([150, null, null, null]);
  });

  it("수신이 끊긴 구간에 null 점을 넣는다", () => {
    const d = toChartData([smp(0, 2), smp(10_000, 2), smp(600_000, 2)]);
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

describe("fmtStage", () => {
  it("수거 단계 표시", () => {
    expect(fmtStage(0)).toBe("1단계 미만");
    expect(fmtStage(3)).toBe("3단계");
    expect(fmtStage(null)).toBe("—");
  });
});

describe("etaToDanger", () => {
  it("남은 무게 ÷ 증가 속도", () => {
    expect(etaToDanger(600, 16, 1000)).toEqual({ kind: "eta", minutes: 25 });
  });
  it("이미 초과 / 늘지 않음 / 계산 불가", () => {
    expect(etaToDanger(1200, 30, 1000)).toEqual({ kind: "over" });
    expect(etaToDanger(300, 0.5, 1000)).toEqual({ kind: "flat" });
    expect(etaToDanger(300, -4, 1000)).toEqual({ kind: "flat" });
    expect(etaToDanger(300, null, 1000)).toEqual({ kind: "unknown" });
    expect(etaToDanger(null, 10, 1000)).toEqual({ kind: "unknown" });
  });
});

describe("stateDurations", () => {
  const M = 60000;
  it("구간 안 전환으로 상태별 시간을 나눈다", () => {
    const tr = [
      { ts: 40 * M, from: "warn", to: "danger" }, // 최신순
      { ts: 10 * M, from: "normal", to: "warn" },
    ];
    expect(stateDurations(tr, "danger", 0, 60 * M)).toEqual({ normal: 10 * M, warn: 30 * M, danger: 20 * M, check: 0 });
  });
  it("구간 밖 전환은 무시, 전환이 없으면 지금 상태로 전부", () => {
    expect(stateDurations([{ ts: -5 * M, from: "normal", to: "warn" }], "warn", 0, 30 * M)).toEqual({ normal: 0, warn: 30 * M, danger: 0, check: 0 });
  });
});

describe("rainFillRates", () => {
  const S = 10000;
  const pts = (n, start, step, rainMm, t0) => Array.from({ length: n }, (_, i) => ({ ts: t0 + i * S, weightG: start + i * step, rainMm }));
  it("비 올 때와 안 올 때 속도를 따로", () => {
    // 맑음 10분: 10초에 1g (분당 6g) → 비 10분: 10초에 5g (분당 30g)
    const h = [...pts(61, 100, 1, 0, 0), ...pts(60, 165, 5, 10, 610 * S)];
    const r = rainFillRates(h, { rainMmH: 1 });
    expect(r.dry).toBeCloseTo(6, 0);
    expect(r.rain).toBeCloseTo(30, 0);
  });
  it("수거로 크게 줄어든 사이·끊긴 사이는 빼고, 짧으면 null", () => {
    const h = [...pts(61, 100, 1, 0, 0), { ts: 610 * S, weightG: 0, rainMm: 0 }, { ts: 2000 * S, weightG: 5, rainMm: 0 }];
    const r = rainFillRates(h, { rainMmH: 1 });
    expect(r.dry).toBeCloseTo(6, 0);
    expect(r.rain).toBeNull();
  });
});

describe("forecastLine", () => {
  const M = 60000;
  it("30분 안에 기준에 닿으면 그 지점에서 멈춘다", () => {
    expect(forecastLine({ ts: 0, totalG: 600, rateGPerMin: 20, dangerG: 1000 })).toEqual({ fromTs: 0, fromG: 600, toTs: 20 * M, toG: 1000, crossTs: 20 * M });
  });
  it("멀면 30분 앞까지만", () => {
    expect(forecastLine({ ts: 0, totalG: 300, rateGPerMin: 10, dangerG: 1000 })).toEqual({ fromTs: 0, fromG: 300, toTs: 30 * M, toG: 600, crossTs: null });
  });
  it("그릴 수 없는 경우", () => {
    expect(forecastLine({ ts: 0, totalG: 1200, rateGPerMin: 10, dangerG: 1000 })).toBeNull();
    expect(forecastLine({ ts: 0, totalG: 300, rateGPerMin: 0.2, dangerG: 1000 })).toBeNull();
    expect(forecastLine({ ts: 0, totalG: 300, rateGPerMin: null, dangerG: 1000 })).toBeNull();
  });
});

describe("nextRain", () => {
  const H = 3600e3;
  const hours = [
    { ts: 0, rainMm: 0, pty: 0 },
    { ts: H, rainMm: 0, pty: 0 },
    { ts: 2 * H, rainMm: 3, pty: 1 },
    { ts: 5 * H, rainMm: 10, pty: 1 },
  ];
  it("가장 가까운 비 시각", () => {
    expect(nextRain(hours, 10 * 60e3)).toEqual({ ts: 2 * H, rainMm: 3 });
  });
  it("withinH시간 밖이면 없음, 지금 시간대도 포함", () => {
    expect(nextRain(hours, 0, { withinH: 1 })).toBeNull();
    expect(nextRain(hours, 2.5 * H)).toEqual({ ts: 2 * H, rainMm: 3 });
  });
  it("빗방울(PTY 5)은 1mm 미만이어도 비", () => {
    expect(nextRain([{ ts: 0, rainMm: 0.5, pty: 5 }], 0)).toEqual({ ts: 0, rainMm: 0.5 });
    expect(nextRain([{ ts: 0, rainMm: 0, pty: 0 }], 0)).toBeNull();
  });
});

describe("stateSegments", () => {
  it("이어지는 같은 상태를 한 구간으로", () => {
    expect(stateSegments(["normal", "normal", "warn", "normal"])).toEqual([
      { state: "normal", start: 0, end: 2 },
      { state: "warn", start: 2, end: 3 },
      { state: "normal", start: 3, end: 4 },
    ]);
    expect(stateSegments([])).toEqual([]);
  });
});

describe("timeTicks / fmtTick (그래프 시간축)", () => {
  const MIN = 60_000;
  const local = (h, m, sec = 0) => new Date(2026, 10, 16, h, m, sec).getTime();
  const labelsOf = (from, to) => {
    const { ticks, stepMs } = timeTicks(from, to);
    return { ticks, stepMs, labels: ticks.map((t) => fmtTick(t, stepMs)) };
  };

  it("5분 구간: 1분 간격 눈금이고 라벨이 서로 다르다 (예전엔 30초 간격 + HH:MM 라벨로 22:50이 두 번 나옴)", () => {
    const from = local(22, 45, 17);
    const r = labelsOf(from, from + 5 * MIN);
    expect(r.stepMs).toBe(MIN);
    expect(new Set(r.labels).size).toBe(r.labels.length);
    expect(r.ticks.every((t) => new Date(t).getSeconds() === 0)).toBe(true); // 분 경계
    expect(r.ticks.every((t) => t >= from && t <= from + 5 * MIN)).toBe(true);
  });

  it("1시간 구간: 10분 간격(분이 0·10·20…), 눈금 7개 이하", () => {
    const from = local(21, 53, 40);
    const r = labelsOf(from, from + 60 * MIN);
    expect(r.stepMs).toBe(10 * MIN);
    expect(r.ticks.length).toBeLessThanOrEqual(7);
    expect(r.ticks.every((t) => new Date(t).getMinutes() % 10 === 0)).toBe(true);
  });

  it("1분 미만 간격이면 초까지 표시", () => {
    const from = local(22, 45, 3);
    const r = labelsOf(from, from + 90_000);
    expect(r.stepMs).toBeLessThan(MIN);
    expect(r.labels.every((l) => /^\d\d:\d\d:\d\d$/.test(l))).toBe(true);
  });

  it("어떤 구간 길이에서도 눈금 개수가 적당하고 라벨이 중복되지 않는다", () => {
    for (const span of [45e3, 90e3, 3 * MIN, 5 * MIN, 12 * MIN, 20 * MIN, 60 * MIN, 3 * 60 * MIN, 12 * 60 * MIN]) {
      const from = local(22, 41, 29);
      const { labels } = labelsOf(from, from + span);
      expect(new Set(labels).size).toBe(labels.length);
      expect(labels.length).toBeLessThanOrEqual(8);
      expect(labels.length).toBeGreaterThan(0);
    }
  });

  it("구간이 0이거나 거꾸로면 눈금 하나", () => {
    expect(timeTicks(1000, 1000).ticks).toEqual([1000]);
    expect(timeTicks(2000, 1000).ticks).toEqual([2000]);
  });
});

describe("shownWeight (화면 총 중량)", () => {
  const st = (connected, w, totalG) => ({ connected, latest: { weightG: w }, judgement: { metrics: { totalG } } });
  it("실물 수신 중이면 센서 최신값", () => expect(shownWeight(st(true, 400, 12))).toBe(400));
  it("가상 지점은 판정 평활값", () => expect(shownWeight(st(false, 400, 12))).toBe(12));
  it("센서 이상(null·음수)이면 평활값", () => {
    expect(shownWeight(st(true, null, 12))).toBe(12);
    expect(shownWeight(st(true, -500, 12))).toBe(12);
  });
});
