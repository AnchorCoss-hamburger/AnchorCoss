// 판정 비교 페이지 (#/compare): 같은 센서 데이터를 "단순 임계값"과 "우리 방식"으로 판정해 나란히 보여 준다.
// 발표에서 "그냥 if문이랑 뭐가 달라요?"에 답하는 화면. 계산은 src/logic/evaluate.js (npm run scenario와 같은 코드).

import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from "recharts";
import { runScenario } from "../logic/evaluate.js";
import { SCENARIOS } from "../sim/scenario.js";
import { STATES, STATE_META } from "../logic/states.js";
import { TH } from "../config.js";
import { COLORS } from "../ui/colors.js";
import { stateSegments } from "../ui/format.js";

const SEEDS = [1, 2, 3, 4, 5]; // 표는 난수 5번 평균 (npm run scenario와 같음)
const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검" };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

/** 시간에 따른 상태 색 띠 한 줄 */
function StateBand({ label, states, changes, falseCount, highlight }) {
  const segs = stateSegments(states);
  const n = states.length || 1;
  return (
    <div className={`band-row${highlight ? " is-ours" : ""}`}>
      <div className="band-label">
        {label}
        <div className="band-meta num">
          변경 {changes}회
          {falseCount != null && (
            <b className={falseCount > 0 ? "tx-danger" : "tx-normal"}> · 오경보 {falseCount}</b>
          )}
        </div>
      </div>
      <div className="band-track" role="img" aria-label={`${label}: 상태 변경 ${changes}회`}>
        {segs.map((s, i) => (
          <span
            key={i}
            className={`band-seg st-${s.state}`}
            style={{ width: `${((s.end - s.start) / n) * 100}%` }}
            title={`${SHORT[s.state]}`}
          />
        ))}
      </div>
    </div>
  );
}

export function ComparePage() {
  const [scenarioId, setScenarioId] = useState("gradual");
  const run = useMemo(() => runScenario(scenarioId, { seed: 1 }), [scenarioId]);
  // 전체 시나리오 × 난수 5번 평균 (처음 한 번만 계산)
  const table = useMemo(
    () =>
      SCENARIOS.map((sc) => {
        const rs = SEEDS.map((seed) => runScenario(sc.id, { seed }).summary);
        const avg = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
        return {
          id: sc.id,
          name: sc.name,
          accJudge: avg("accJudge"),
          accBaseline: avg("accBaseline"),
          falseJudge: avg("falseJudge"),
          falseBaseline: avg("falseBaseline"),
        };
      }),
    [],
  );
  const total = {
    accJudge: table.reduce((a, r) => a + r.accJudge, 0) / table.length,
    accBaseline: table.reduce((a, r) => a + r.accBaseline, 0) / table.length,
    falseJudge: table.reduce((a, r) => a + r.falseJudge, 0),
    falseBaseline: table.reduce((a, r) => a + r.falseBaseline, 0),
  };

  const { rows, summary, scenario } = run;
  const data = rows.map((r) => ({
    t: Math.round(r.t * 10) / 10,
    w: r.sample && r.sample.weightG != null && r.sample.weightG >= 0 ? r.sample.weightG : null,
  }));
  const yMax = Math.ceil(Math.max(TH.DANGER_TOTAL_G * 1.2, ...data.map((d) => d.w ?? 0)) / 100) * 100;

  return (
    <div className="compare">
      <section className="panel compare-hero">
        <div>
          <h2>같은 데이터, 다른 판정</h2>
          <p className="muted">
            센서 오차(±100g)가 섞인 같은 무게 데이터를 두 방식으로 판정했습니다. 단순 임계값은 기준선 근처에서 상태가
            자주 바뀌어 오경보가 생기고, 우리 방식은 안정적으로 판정합니다.
          </p>
        </div>
        <div className="compare-kpis">
          <div className="kpi">
            <span className="kpi-label">오경보 (8개 시나리오 합계)</span>
            <span className="kpi-row">
              <span>
                단순 <b className="num tx-danger">{Math.round(total.falseBaseline)}회</b>
              </span>
              <span>
                우리 방식 <b className="num tx-normal">{Math.round(total.falseJudge)}회</b>
              </span>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">정확도 (정답과 같은 비율)</span>
            <span className="kpi-row">
              <span>
                단순 <b className="num">{pct(total.accBaseline)}</b>
              </span>
              <span>
                우리 방식 <b className="num">{pct(total.accJudge)}</b>
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="compare-head">
          <h3 className="block-title">시나리오별로 보기</h3>
          <label className="detail-scenario">
            <span className="muted">시나리오</span>
            <select
              className="control-select"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              aria-label="비교할 시나리오"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <span className="muted compare-desc">{scenario.description}</span>
        </div>

        <div className="chart-box compare-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 68 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} stroke={COLORS.axis} fontSize={12} tickFormatter={(v) => `${v}분`} />
              <YAxis domain={[0, yMax]} stroke={COLORS.axis} fontSize={12} width={52} tickFormatter={(v) => `${v}g`} />
              <ReferenceLine y={TH.WARN_TOTAL_G} stroke={COLORS.warn} strokeDasharray="5 4" label={{ value: "주의", position: "insideTopLeft", fill: COLORS.warnText, fontSize: 11 }} />
              <ReferenceLine y={TH.DANGER_TOTAL_G} stroke={COLORS.danger} strokeDasharray="5 4" label={{ value: "위험(수거)", position: "insideTopLeft", fill: COLORS.dangerText, fontSize: 11 }} />
              <Tooltip labelFormatter={(v) => `${v}분`} formatter={(v) => [`${v}g`, "센서 값"]} isAnimationActive={false} />
              <Line type="linear" dataKey="w" stroke={COLORS.total} dot={false} strokeWidth={1.5} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bands">
          <StateBand label="정답" states={rows.map((r) => r.truth)} changes={summary.changesTruth} />
          <StateBand
            label="단순 임계값"
            states={rows.map((r) => r.baseline)}
            changes={summary.changesBaseline}
            falseCount={summary.falseBaseline}
          />
          <StateBand
            label="우리 방식"
            states={rows.map((r) => r.judged)}
            changes={summary.changesJudge}
            falseCount={summary.falseJudge}
            highlight
          />
          <ul className="band-legend">
            {[STATES.NORMAL, STATES.WARN, STATES.DANGER, STATES.CHECK].map((st) => (
              <li key={st}>
                <span className={`band-dot st-${st}`} /> {STATE_META[st].label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="compare-bottom">
        <section className="panel">
          <h3 className="block-title">우리 방식이 하는 일</h3>
          <ul className="compare-list">
            <li>
              <b>30초 중앙값</b> — 샘플 하나가 튀어도 판정값이 흔들리지 않음
            </li>
            <li>
              <b>이상치 필터</b> — 직전보다 {TH.MAX_JUMP_G}g 넘게 갑자기 바뀌면 한 번은 무시 (충격·물 튐)
            </li>
            <li>
              <b>디바운싱</b> — 새 상태가 {TH.DEBOUNCE_SEC}초 이상 이어져야 바꿈
            </li>
            <li>
              <b>히스테리시스</b> — 내려올 때는 기준의 {Math.round(TH.RECOVER_RATIO * 100)}% 아래로 떨어져야 바꿈 (경계 깜빡임 방지)
            </li>
          </ul>
          <p className="muted compare-note">
            대가로 상태 변화를 30초 정도 늦게 잡아서 정확도는 비슷하지만, 잘못된 알림이 사라집니다.
          </p>
        </section>

        <section className="panel">
          <h3 className="block-title">시나리오 8종 결과 (난수 5번 평균)</h3>
          <table className="compare-table">
            <thead>
              <tr>
                <th>시나리오</th>
                <th className="num-col">정확도 단순</th>
                <th className="num-col">정확도 우리</th>
                <th className="num-col">오경보 단순</th>
                <th className="num-col">오경보 우리</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.id} className={r.id === scenarioId ? "is-on" : ""} onClick={() => setScenarioId(r.id)}>
                  <td>{r.name}</td>
                  <td className="num-col num">{pct(r.accBaseline)}</td>
                  <td className="num-col num">{pct(r.accJudge)}</td>
                  <td className={`num-col num${r.falseBaseline > 0 ? " tx-danger" : ""}`}>{r.falseBaseline.toFixed(1)}</td>
                  <td className="num-col num tx-normal">{r.falseJudge.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted compare-note">⚠ 가상 시나리오 기준이며 실제 환경 정확도가 아닙니다 (합동 테스트 후 재측정).</p>
        </section>
      </div>
    </div>
  );
}
