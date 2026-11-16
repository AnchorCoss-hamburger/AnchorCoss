// 화면 표시용 순수 함수 (React 무관, 테스트 가능)

import { STATES, FLAGS } from "../logic/states.js";

/** 상태별 지점 수 { normal, warn, danger, check } */
export function countByState(stations) {
  const c = { [STATES.NORMAL]: 0, [STATES.WARN]: 0, [STATES.DANGER]: 0, [STATES.CHECK]: 0 };
  for (const s of stations) {
    const st = s.judgement?.state;
    if (st in c) c[st] += 1;
  }
  return c;
}

/**
 * 수거 우선순위 정렬 (DESIGN.md 5장 PriorityList)
 * 1) 점검 필요는 맨 아래  2) 막힘 점수 내림차순  3) 같은 점수면 우천 중 우선  4) 이름순
 */
export function sortByPriority(stations) {
  const isCheck = (s) => s.judgement?.state === STATES.CHECK;
  const raining = (s) => (s.judgement?.flags ?? []).includes(FLAGS.RAINING);
  return [...stations].sort((a, b) => {
    if (isCheck(a) !== isCheck(b)) return isCheck(a) ? 1 : -1;
    const ds = (b.judgement?.score ?? -1) - (a.judgement?.score ?? -1);
    if (ds !== 0) return ds;
    if (raining(a) !== raining(b)) return raining(a) ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });
}

/** 경과 시간: 방금 / N분 전 / N시간 전 */
export function fmtAgo(now, ts) {
  if (ts == null) return "수신 없음";
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

/** 시각 HH:MM:SS (24시간) */
export function fmtTime(ts) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

/** 1,234g */
export function fmtG(v) {
  return v == null ? "—" : `${Math.round(v).toLocaleString("ko-KR")}g`;
}

/** 시각 HH:MM (그래프 축) */
export function fmtHM(ts) {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// 그래프 시간축 눈금 간격 후보 (ms). 구간에 맞는 가장 촘촘한 간격을 고른다
const TICK_STEPS_MS = [10e3, 15e3, 30e3, 60e3, 2 * 60e3, 5 * 60e3, 10 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 6 * 3600e3];

/**
 * 그래프 시간축 눈금: 구간 [from, to]를 maxTicks개 안팎의 "깔끔한 간격"(현지 시각의 분·초 경계)으로 나눈다.
 * 라벨은 fmtTick으로 만든다. 눈금 간격과 라벨 해상도를 맞추지 않으면 5분 구간에 30초 간격 눈금이
 * 찍히면서 "22:50"이 두 번 나오는 식의 중복 라벨이 생긴다.
 * @returns {{ ticks: number[], stepMs: number }}
 */
export function timeTicks(from, to, maxTicks = 6) {
  const span = to - from;
  if (!(span > 0)) return { ticks: [from], stepMs: 60e3 };
  const stepMs = TICK_STEPS_MS.find((s) => span / s <= maxTicks) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  const off = new Date(from).getTimezoneOffset() * 60e3; // 현지 시각 = ts - off
  const ticks = [];
  for (let t = Math.ceil((from - off) / stepMs) * stepMs + off; t <= to; t += stepMs) ticks.push(t);
  return { ticks, stepMs };
}

/** 눈금 라벨: 간격이 1분 미만이면 초까지(HH:MM:SS), 아니면 HH:MM */
export function fmtTick(ts, stepMs) {
  return stepMs < 60e3 ? fmtTime(ts) : fmtHM(ts);
}

/** 신호 세기 4단계 (dBm): -60 이상 4칸 … -90 미만 0칸 */
export function rssiLevel(rssi) {
  if (rssi == null) return 0;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  if (rssi >= -90) return 1;
  return 0;
}

/** 센서 값이 유효한지 (음수·누락·범위 초과는 무효) */
const valid = (v, maxG) => v != null && v >= 0 && v <= maxG;

/**
 * 샘플 이력 → 그래프 데이터.
 * 수신이 끊긴 구간(gapMs 초과)에는 null 점을 넣어 선이 이어지지 않게 한다.
 * 센서 이상값은 null로 바꿔 그래프에서 빠지게 한다.
 */
export function toChartData(history, { gapMs = 30_000, maxG = 5000 } = {}) {
  const out = [];
  for (let i = 0; i < history.length; i++) {
    const s = history[i];
    const prev = history[i - 1];
    if (prev && s.ts - prev.ts > gapMs) {
      out.push({ ts: prev.ts + 1, total: null, rain: prev.rainMm });
    }
    out.push({ ts: s.ts, total: valid(s.weightG, maxG) ? s.weightG : null, rain: s.rainMm });
  }
  return out;
}

/**
 * 그래프용 간격 축소: 점이 maxPoints보다 많으면 시간 구간별 평균으로 줄인다.
 * - 값이 전부 null인 구간은 null로 남겨 끊김(통신 두절)을 유지
 * - 강우는 구간 최대값 (짧은 비도 우천 구간으로 보이게)
 */
export function downsample(data, maxPoints) {
  if (data.length <= maxPoints) return data;
  const from = data[0].ts;
  const width = (data[data.length - 1].ts - from) / maxPoints || 1;
  const buckets = new Map();
  for (const d of data) {
    const k = Math.min(maxPoints - 1, Math.floor((d.ts - from) / width));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d);
  }
  const mean = (arr, key) => {
    const v = arr.map((x) => x[key]).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, arr]) => ({
      ts: arr[Math.floor(arr.length / 2)].ts,
      total: mean(arr, "total"),
      rain: Math.max(...arr.map((x) => x.rain ?? 0)),
    }));
}

/** 강우 구간 [{ from, to }] (rain ≥ minMm 이 이어지는 구간) */
export function rainSegments(data, minMm) {
  const segs = [];
  let start = null;
  for (let i = 0; i < data.length; i++) {
    const on = data[i].rain >= minMm;
    if (on && start == null) start = data[i].ts;
    if (!on && start != null) {
      segs.push({ from: start, to: data[i - 1].ts });
      start = null;
    }
  }
  if (start != null) segs.push({ from: start, to: data[data.length - 1].ts });
  return segs;
}

/**
 * 수거 경로에 넣을 지점: 위험(수거 필요) 지점, includeWarn이면 주의 지점도.
 * 점검 필요(통신 두절·센서 이상)는 무게를 믿을 수 없어 넣지 않는다.
 */
export function collectTargets(stations, { includeWarn = true } = {}) {
  const want = new Set([STATES.DANGER, ...(includeWarn ? [STATES.WARN] : [])]);
  return stations.filter((s) => want.has(s.judgement?.state));
}

/** 2.4km / 850m */
export function fmtDistance(m) {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

/** 약 12분 / 약 1시간 5분 */
export function fmtDuration(sec) {
  if (sec == null) return "—";
  const min = Math.max(1, Math.round(sec / 60));
  if (min < 60) return `약 ${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `약 ${h}시간${m ? ` ${m}분` : ""}`;
}

/**
 * 메인 화면 필터: source("all" | "real" | "virtual")와 state(null = 전체 상태)
 * 실물 = 설정상 실물 센서 지점(real: true)
 */
export function filterStations(stations, { source = "all", state = null } = {}) {
  return stations.filter(
    (s) =>
      (source === "all" || (source === "real") === Boolean(s.real)) &&
      (state == null || s.judgement?.state === state),
  );
}

/**
 * 작은 추세 그래프(스파크라인)용 SVG 경로.
 * points: [{ ts, total }] (total=null이면 선을 끊음 — 통신 두절·센서 이상)
 * → { line, area } path 문자열. 그릴 점이 없으면 빈 문자열
 */
export function sparkPath(points, { width, height, maxG }) {
  const valid = points.filter((p) => p.total != null);
  if (!valid.length) return { line: "", area: "" };
  const t0 = points[0].ts;
  const span = points[points.length - 1].ts - t0 || 1;
  const x = (ts) => ((ts - t0) / span) * width;
  const y = (g) => height - (Math.min(g, maxG) / maxG) * height;
  const r1 = (n) => Math.round(n * 10) / 10;

  let line = "";
  let area = "";
  let seg = [];
  const flush = () => {
    if (!seg.length) return;
    line += seg.map((p, i) => `${i ? "L" : "M"}${r1(x(p.ts))},${r1(y(p.total))}`).join("");
    const first = r1(x(seg[0].ts));
    const last = r1(x(seg[seg.length - 1].ts));
    area += `M${first},${height}` + seg.map((p) => `L${r1(x(p.ts))},${r1(y(p.total))}`).join("") + `L${last},${height}Z`;
    seg = [];
  };
  for (const p of points) {
    if (p.total == null) flush();
    else seg.push(p);
  }
  flush();
  return { line, area };
}

/** 하드웨어 수거 단계 표시: 0 → "1단계 미만", 2 → "2단계", null → "—" */
export function fmtStage(stage) {
  if (stage == null) return "—";
  return stage === 0 ? "1단계 미만" : `${stage}단계`;
}

/**
 * 수거 기준 도달 예상 (지금 증가 속도가 이어진다고 가정한 단순 직선 예측).
 * → { kind: "over" }          이미 기준 이상
 *   { kind: "eta", minutes }  기준까지 남은 시간(분)
 *   { kind: "flat" }          늘지 않음 (분당 minRate g 미만)
 *   { kind: "unknown" }       값이나 속도를 아직 계산할 수 없음 (데이터 5분 미만 등)
 */
export function etaToDanger(totalG, rateGPerMin, dangerG, { minRate = 1 } = {}) {
  if (totalG == null) return { kind: "unknown" };
  if (totalG >= dangerG) return { kind: "over" };
  if (rateGPerMin == null) return { kind: "unknown" };
  if (rateGPerMin < minRate) return { kind: "flat" };
  return { kind: "eta", minutes: (dangerG - totalG) / rateGPerMin };
}

/**
 * 구간 [from, to] 동안 상태별 머문 시간(ms).
 * transitions: 최신순 [{ ts, from, to }], current: 지금 상태.
 * 구간 시작 시점의 상태는 "구간 안 첫 전환의 from" (전환이 없으면 지금 상태)로 본다.
 */
export function stateDurations(transitions, current, from, to) {
  const out = { normal: 0, warn: 0, danger: 0, check: 0 };
  if (!(to > from)) return out;
  const inWin = transitions.filter((t) => t.ts > from && t.ts <= to).sort((a, b) => a.ts - b.ts);
  let state = inWin.length ? inWin[0].from : current;
  let t0 = from;
  for (const t of inWin) {
    if (state in out) out[state] += t.ts - t0;
    state = t.to;
    t0 = t.ts;
  }
  if (state in out) out[state] += to - t0;
  return out;
}

/**
 * 비 올 때 vs 안 올 때 평균 적재 속도 (분당 g).
 * 이웃한 두 샘플 사이의 증가량을 강우 여부로 나눠 더한 뒤 시간으로 나눈다 (노이즈는 구간 안에서 상쇄됨).
 * 제외: 수신이 끊긴 사이(gapMs 초과), 센서 이상값, 수거로 크게 줄어든 사이(dropG 넘게 감소).
 * 한쪽 시간이 minMin분 미만이면 그쪽은 null (판단하기에 너무 짧음).
 * @returns {{ rain: number|null, dry: number|null, rainMin: number, dryMin: number }}
 */
export function rainFillRates(history, { rainMmH, maxG = 5000, gapMs = 30_000, dropG = 300, minMin = 5 } = {}) {
  const acc = { rain: { g: 0, ms: 0 }, dry: { g: 0, ms: 0 } };
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1];
    const b = history[i];
    const dt = b.ts - a.ts;
    if (dt <= 0 || dt > gapMs) continue;
    if (!valid(a.weightG, maxG) || !valid(b.weightG, maxG)) continue;
    const dg = b.weightG - a.weightG;
    if (dg < -dropG) continue; // 수거
    const k = (b.rainMm ?? 0) >= rainMmH ? "rain" : "dry";
    acc[k].g += dg;
    acc[k].ms += dt;
  }
  const rate = (x) => (x.ms >= minMin * 60000 ? x.g / (x.ms / 60000) : null);
  return { rain: rate(acc.rain), dry: rate(acc.dry), rainMin: acc.rain.ms / 60000, dryMin: acc.dry.ms / 60000 };
}

/**
 * 그래프 예측선: 지금 값에서 지금 속도로 직선을 그린다 (최대 horizonMin분 앞까지).
 * 수거 기준에 horizonMin분 안에 닿으면 그 지점에서 멈추고 crossTs를 준다.
 * 그릴 수 없으면(속도 없음·늘지 않음·이미 초과·값 없음) null.
 * @returns {null | { fromTs, fromG, toTs, toG, crossTs: number|null }}
 */
export function forecastLine({ ts, totalG, rateGPerMin, dangerG, horizonMin = 30, minRate = 1 }) {
  const e = etaToDanger(totalG, rateGPerMin, dangerG, { minRate });
  if (e.kind !== "eta" || ts == null) return null;
  const min = Math.min(e.minutes, horizonMin);
  const crosses = e.minutes <= horizonMin;
  return {
    fromTs: ts,
    fromG: totalG,
    toTs: ts + min * 60000,
    toG: crosses ? dangerG : totalG + rateGPerMin * min,
    crossTs: crosses ? ts + e.minutes * 60000 : null,
  };
}

/**
 * 예보에서 다음 비 시각 찾기 (지금 시간대 포함, withinH시간 안).
 * 비로 보는 기준: 강수 형태(PTY)가 있거나 1시간 강수량이 minMm 이상.
 * @param {{ ts:number, rainMm:number, pty:number }[]} hours 초단기예보 시각별 (ts = 그 1시간의 시작)
 * @returns {null | { ts:number, rainMm:number }}
 */
export function nextRain(hours, nowTs, { minMm = 1, withinH = 3 } = {}) {
  const until = nowTs + withinH * 3600e3;
  const h = (hours ?? [])
    .filter((x) => x.ts + 3600e3 > nowTs && x.ts <= until)
    .sort((a, b) => a.ts - b.ts)
    .find((x) => x.pty !== 0 || x.rainMm >= minMm);
  return h ? { ts: h.ts, rainMm: h.rainMm } : null;
}

/** 상태 배열 → 같은 상태가 이어지는 구간 [{ state, start, end }] (end는 포함하지 않음) */
export function stateSegments(states) {
  const out = [];
  states.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.state === s) last.end = i + 1;
    else out.push({ state: s, start: i, end: i + 1 });
  });
  return out;
}
