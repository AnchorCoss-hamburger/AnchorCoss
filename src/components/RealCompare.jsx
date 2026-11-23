// 판정 비교 — 실측 기록 모드: 실물 센서(st-1)가 서버에 보낸 기록을 단순 임계값·우리 방식으로 다시 판정하고,
// 합동 테스트 때 적어 둔 "언제부터 언제까지 몇 g을 올렸는지"(정답 구간)와 비교한다. 계산은 src/logic/replay.js.

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from "recharts";
import { replayCompare } from "../logic/replay.js";
import { DEFAULT_STATIONS } from "../sim/simulator.js";
import { TH } from "../config.js";
import { COLORS } from "../ui/colors.js";
import { fmtTime } from "../ui/format.js";
import { StateBand } from "./StateBand.jsx";

const REAL_ID = DEFAULT_STATIONS.find((s) => s.real)?.id ?? "st-1";
const STORE_KEY = "anchorcoss.realCompare";
const DEFAULT_SPAN_MS = 30 * 60 * 1000; // 처음엔 마지막 기록부터 30분
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

// <input type="datetime-local"> 값 ↔ ms (브라우저 현지 시각)
const pad = (n) => String(n).padStart(2, "0");
function toLocalInput(ms) {
  if (ms == null || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const fromLocalInput = (v) => {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

function loadSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function save(v) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* 저장 못 해도 이번 화면에서는 동작함 */
  }
}

export function RealCompare() {
  const saved = useMemo(loadSaved, []);
  const [from, setFrom] = useState(saved.from ?? null);
  const [to, setTo] = useState(saved.to ?? null);
  const [segments, setSegments] = useState(Array.isArray(saved.segments) ? saved.segments : []);
  const [samples, setSamples] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // 기록 불러오기: 시작 시각이 있으면 그 이후, 없으면 최근 기록 (최대 5000건 ≈ 1초 간격 83분)
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    const since = from != null ? from : 0;
    fetch(`/api/stations?id=${encodeURIComponent(REAL_ID)}&since=${since}&limit=5000`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (!j.ok) throw new Error(j.error || "조회 실패");
        const list = j.samples ?? [];
        setSamples(list);
        setStatus("ok");
        // 범위를 아직 안 정했으면 마지막 기록 기준 30분
        if (from == null && list.length) {
          const last = list[list.length - 1].ts;
          setFrom(Math.max(list[0].ts, last - DEFAULT_SPAN_MS));
          setTo(last);
        }
      })
      .catch((e) => {
        if (!alive) return;
        setStatus("error");
        setError(e.message || "서버에 연결할 수 없습니다");
      });
    return () => {
      alive = false;
    };
    // from은 "불러오기"를 누를 때만 반영 (입력할 때마다 다시 받지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  useEffect(() => save({ from, to, segments }), [from, to, segments]);

  const picked = useMemo(
    () => samples.filter((s) => (from == null || s.ts >= from) && (to == null || s.ts <= to)),
    [samples, from, to],
  );
  const valid = useMemo(
    () => segments.filter((s) => s.from != null && s.to != null && s.to > s.from && Number.isFinite(s.weightG)),
    [segments],
  );
  const { rows, summary } = useMemo(() => replayCompare(picked, valid), [picked, valid]);
  const hasTruth = summary.covered > 0;
  const times = rows.map((r) => r.ts);
  const data = rows.map((r) => ({ t: r.ts, w: r.w }));
  const yMax = Math.ceil(Math.max(TH.DANGER_TOTAL_G * 1.2, ...data.map((d) => d.w ?? 0)) / 100) * 100;

  const setSeg = (i, patch) => setSegments((list) => list.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const addSeg = () => {
    const last = segments[segments.length - 1];
    const start = last?.to ?? from ?? picked[0]?.ts ?? null;
    setSegments((list) => [...list, { from: start, to: start != null ? start + 60_000 : null, weightG: 0 }]);
  };

  return (
    <>
      <section className="panel compare-hero">
        <div>
          <h2>실측 기록으로 비교</h2>
          <p className="muted">
            실물 센서가 실제로 보낸 무게 기록을 두 방식으로 다시 판정합니다. 실험 때 올려 둔 물건의 무게를 아래 "정답 구간"에
            적으면 정확도와 오경보도 계산됩니다.
          </p>
        </div>
        <div className="compare-kpis">
          <div className="kpi">
            <span className="kpi-label">오경보 (정답 구간 안)</span>
            <span className="kpi-row">
              <span>
                단순 <b className={`num${hasTruth ? " tx-danger" : ""}`}>{hasTruth ? `${summary.falseBaseline}회` : "—"}</b>
              </span>
              <span>
                우리 방식 <b className={`num${hasTruth ? " tx-normal" : ""}`}>{hasTruth ? `${summary.falseJudge}회` : "—"}</b>
              </span>
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">
              정확도 (정답 있는 샘플 {summary.covered.toLocaleString("ko-KR")} / {summary.samples.toLocaleString("ko-KR")}건)
            </span>
            <span className="kpi-row">
              <span>
                단순 <b className="num">{pct(summary.accBaseline)}</b>
              </span>
              <span>
                우리 방식 <b className="num">{pct(summary.accJudge)}</b>
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="compare-head">
          <h3 className="block-title">기록 구간</h3>
          <label className="real-field">
            <span className="muted">시작</span>
            <input
              type="datetime-local"
              step="1"
              className="control-input num"
              value={toLocalInput(from)}
              onChange={(e) => setFrom(fromLocalInput(e.target.value))}
            />
          </label>
          <label className="real-field">
            <span className="muted">끝</span>
            <input
              type="datetime-local"
              step="1"
              className="control-input num"
              value={toLocalInput(to)}
              onChange={(e) => setTo(fromLocalInput(e.target.value))}
            />
          </label>
          <button className="btn" onClick={() => setReloadKey((k) => k + 1)}>
            불러오기
          </button>
          <span className="muted compare-desc">
            {status === "loading" && "불러오는 중…"}
            {status === "error" && <span className="tx-danger">기록을 불러오지 못했습니다: {error} (센서 서버가 켜져 있는지 확인)</span>}
            {status === "ok" && `${REAL_ID} 기록 ${picked.length.toLocaleString("ko-KR")}건`}
          </span>
        </div>

        {status === "ok" && picked.length === 0 ? (
          <p className="muted real-empty">
            이 구간에 기록이 없습니다. 실물 센서를 연결해 기록을 쌓은 뒤(<code>npm run serial</code>) 시작·끝 시각을 맞추고
            "불러오기"를 누르세요.
          </p>
        ) : (
          <>
            <div className="chart-box compare-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 68 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    stroke={COLORS.axis}
                    fontSize={12}
                    tickFormatter={fmtTime}
                  />
                  <YAxis domain={[0, yMax]} stroke={COLORS.axis} fontSize={12} width={52} tickFormatter={(v) => `${v}g`} />
                  <ReferenceLine y={TH.WARN_TOTAL_G} stroke={COLORS.warn} strokeDasharray="5 4" label={{ value: "주의", position: "insideTopLeft", fill: COLORS.warnText, fontSize: 11 }} />
                  <ReferenceLine y={TH.DANGER_TOTAL_G} stroke={COLORS.danger} strokeDasharray="5 4" label={{ value: "위험(수거)", position: "insideTopLeft", fill: COLORS.dangerText, fontSize: 11 }} />
                  <Tooltip labelFormatter={fmtTime} formatter={(v) => [`${v}g`, "센서 값"]} isAnimationActive={false} />
                  <Line type="linear" dataKey="w" stroke={COLORS.total} dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bands">
              {hasTruth && <StateBand label="정답" states={rows.map((r) => r.truth)} times={times} changes={summary.changesTruth} />}
              <StateBand
                label="단순 임계값"
                states={rows.map((r) => r.baseline)}
                times={times}
                changes={summary.changesBaseline}
                falseCount={summary.falseBaseline}
              />
              <StateBand
                label="우리 방식"
                states={rows.map((r) => r.judged)}
                times={times}
                changes={summary.changesJudge}
                falseCount={summary.falseJudge}
                highlight
              />
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="compare-head">
          <h3 className="block-title">정답 구간</h3>
          <span className="muted compare-desc">
            실험 때 "언제부터 언제까지 몇 g을 올려 뒀는지" 적습니다. 브라우저에 저장되어 새로고침해도 남습니다.
          </span>
        </div>
        {segments.length > 0 && (
          <table className="compare-table real-seg-table">
            <thead>
              <tr>
                <th>시작</th>
                <th>끝</th>
                <th className="num-col">올린 무게</th>
                <th aria-label="삭제" />
              </tr>
            </thead>
            <tbody>
              {segments.map((s, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="datetime-local"
                      step="1"
                      className="control-input num"
                      aria-label={`${i + 1}번 구간 시작`}
                      value={toLocalInput(s.from)}
                      onChange={(e) => setSeg(i, { from: fromLocalInput(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      step="1"
                      className="control-input num"
                      aria-label={`${i + 1}번 구간 끝`}
                      value={toLocalInput(s.to)}
                      onChange={(e) => setSeg(i, { to: fromLocalInput(e.target.value) })}
                    />
                  </td>
                  <td className="num-col">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      className="control-input num real-g"
                      aria-label={`${i + 1}번 구간 무게(g)`}
                      value={Number.isFinite(s.weightG) ? s.weightG : ""}
                      onChange={(e) => setSeg(i, { weightG: e.target.value === "" ? NaN : Number(e.target.value) })}
                    />{" "}
                    g
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setSegments((list) => list.filter((_, k) => k !== i))}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="real-seg-actions">
          <button className="btn" onClick={addSeg}>
            + 구간 추가
          </button>
          {segments.length > 0 && (
            <button className="btn btn-sm" onClick={() => setSegments([])}>
              모두 지우기
            </button>
          )}
        </div>
        <p className="muted compare-note">
          정답이 없는 시간은 정확도·오경보 계산에서 빠집니다. 판정 기준: 주의 {TH.WARN_TOTAL_G}g · 위험 {TH.DANGER_TOTAL_G}g
          이상 (src/config.js).
        </p>
      </section>
    </>
  );
}
