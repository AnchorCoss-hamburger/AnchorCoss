// 실측 비교: 실물 센서가 실제로 보낸 기록을 단순 임계값·우리 방식으로 다시 판정하고, 실험 때 올린 무게(정답)와 비교한다.
// 합동 테스트에서 "무게를 아는 물건을 올렸다 내렸다" 한 구간이 정답이 된다.
// 가상 시나리오 비교(evaluate.js)와 같은 판정 코드(createJudge·createBaseline)를 쓴다.

import { createJudge, createBaseline } from "./judge.js";
import { truthFromWeight } from "../sim/scenario.js";
import { TH } from "../config.js";

/**
 * 정답 구간: [{ from: ms, to: ms, weightG }] — 그 시간 동안 거름망에 올려 둔 물건의 무게.
 * 구간 밖 시각은 정답 없음(null)이고 정확도·오경보 계산에서 빠진다.
 */
export function truthAtTs(ts, segments) {
  const seg = segments.find((s) => ts >= s.from && ts <= s.to);
  return seg ? truthFromWeight(seg.weightG) : null;
}

const changes = (seq) => seq.reduce((n, v, i) => n + (i > 0 && v !== seq[i - 1] ? 1 : 0), 0);

/**
 * @param {{ ts:number, weightG:number|null, rainMm?:number }[]} samples 시각 오름차순 실제 기록
 * @param {{ from:number, to:number, weightG:number }[]} segments 정답 구간 (없어도 됨)
 * @returns {{ rows, summary }}
 *   rows: [{ ts, w, truth|null, judged, baseline }]
 *   summary: { samples, covered, changesJudge, changesBaseline, accJudge|null, accBaseline|null,
 *              changesTruth|null, falseJudge|null, falseBaseline|null }
 *   변경 횟수는 전체 구간 기준, 정확도·오경보는 정답이 있는 시각만으로 계산한다.
 */
export function replayCompare(samples, segments = [], th = TH) {
  const judge = createJudge(th);
  const baseline = createBaseline(th);
  const rows = samples.map((s) => {
    const sample = { stationId: "real", rssi: null, batteryPct: null, rainMm: 0, ...s };
    const { judgement } = judge.update({ now: s.ts, sample });
    return {
      ts: s.ts,
      w: s.weightG != null && s.weightG >= 0 ? s.weightG : null,
      truth: truthAtTs(s.ts, segments),
      judged: judgement.state,
      baseline: baseline.update({ now: s.ts, sample }),
    };
  });

  const covered = rows.filter((r) => r.truth != null);
  const has = covered.length > 0;
  const seq = (arr, k) => arr.map((r) => r[k]);
  const acc = (k) => covered.filter((r) => r[k] === r.truth).length / covered.length;
  const changesTruth = has ? changes(seq(covered, "truth")) : null;
  return {
    rows,
    summary: {
      samples: rows.length,
      covered: covered.length,
      changesJudge: changes(seq(rows, "judged")),
      changesBaseline: changes(seq(rows, "baseline")),
      changesTruth,
      accJudge: has ? acc("judged") : null,
      accBaseline: has ? acc("baseline") : null,
      // 오경보: 정답이 있는 시각 동안 정답보다 많이 일어난 상태 변경
      falseJudge: has ? Math.max(0, changes(seq(covered, "judged")) - changesTruth) : null,
      falseBaseline: has ? Math.max(0, changes(seq(covered, "baseline")) - changesTruth) : null,
    },
  };
}
