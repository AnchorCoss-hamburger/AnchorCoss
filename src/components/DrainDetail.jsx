// 지점 상세 (DESIGN.md 5장 DrainDetail)
// 머리: 이름·상태·플래그·조작 / 숫자 카드 한 줄 / 게이지 | 중량 그래프 / 판정 근거·통신 | 상태 전환 기록
import { StateBadge, FlagTags } from "./StateBadge.jsx";
import { LoadCellGauge } from "./LoadCellGauge.jsx";
import { WeightChart } from "./WeightChart.jsx";
import { CommStatus } from "./CommStatus.jsx";
import { Timeline } from "./Timeline.jsx";
import { SCENARIOS } from "../sim/scenario.js";
import { fmtG, fmtAgo, fmtStage } from "../ui/format.js";
import { STATES } from "../logic/states.js";

/** 근거 문장의 숫자(1,234g, 80%, 7분 등)를 굵게 */
function Emph({ text }) {
  const parts = text.split(/(\d[\d,]*(?:\.\d+)?(?:g|%|분|mm\/h)?)/);
  return parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p));
}

/** 증가 속도: 분당 +42g / 분당 -3g / — */
function fmtRate(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Math.round(v);
  return `분당 ${r > 0 ? "+" : ""}${r.toLocaleString("ko-KR")}g`;
}

export function DrainDetail({ station, now, onCollect, onScenario }) {
  if (!station) {
    return (
      <section className="card">
        <p className="muted">지도나 목록에서 지점을 선택하세요.</p>
      </section>
    );
  }
  const j = station.judgement;
  const m = j.metrics ?? {};
  const rain = station.latest?.rainMm;
  const clock = station.clockNow ?? now; // 실물 지점은 실제 시계, 가상 지점은 시뮬레이터 시계

  return (
    <section className={`card detail is-${j.state}`} aria-label={`${station.name} 상세`}>
      <div className="detail-head">
        <h2 className="detail-name">{station.name}</h2>
        <StateBadge state={j.state} pending={j.pending} pulse />
        <FlagTags flags={j.flags} />

        {/* 이 지점만 조작 (전체 제어는 상단바) */}
        {station.live && (
          <span className="tag is-live" title="서버에 수신된 실물 센서 데이터로 판정 중">
            실시간 수신
          </span>
        )}
        <div className="detail-actions">
          <label className="detail-scenario">
            <span className="muted">시나리오</span>
            <select
              className="control-select"
              value={station.scenarioId}
              onChange={(e) => onScenario(station.id, e.target.value)}
              aria-label={`${station.name} 시나리오`}
              disabled={station.live}
              title={station.live ? "실물 센서 지점은 시나리오가 없습니다" : undefined}
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn"
            onClick={() => onCollect(station.id)}
            disabled={station.live}
            title={station.live ? "실물 지점은 실제로 거름망을 비우면 반영됩니다" : "쌓인 쓰레기를 치운 것으로 처리"}
          >
            수거(리셋)
          </button>
        </div>
      </div>

      {/* 숫자 카드 한 줄 */}
      <dl className="detail-stats">
        <div className="stat is-main">
          <dt>총 중량</dt>
          <dd className="num">{fmtG(m.totalG)}</dd>
        </div>
        <div className="stat">
          <dt>수거 단계</dt>
          <dd className="num">{fmtStage(m.stage)}</dd>
        </div>
        <div className="stat">
          <dt>막힘 점수</dt>
          <dd className={`num tx-${j.state}`}>{j.score ?? "—"}</dd>
        </div>
        <div className="stat">
          <dt>증가 속도</dt>
          <dd className="num">{fmtRate(m.rateGPerMin)}</dd>
        </div>
        <div className="stat">
          <dt>강우</dt>
          <dd className="num">{rain == null ? "—" : `${rain}mm/h`}</dd>
        </div>
        <div className="stat">
          <dt>마지막 수신</dt>
          <dd className={`num${j.state === STATES.CHECK ? " tx-check" : ""}`}>{fmtAgo(clock, station.latest?.ts)}</dd>
        </div>
      </dl>

      {/* 게이지 | 그래프 */}
      <div className="detail-row is-chart">
        <div className="detail-block">
          <h3 className="block-title">로드셀</h3>
          <LoadCellGauge sample={station.latest} metrics={j.metrics} state={j.state} />
        </div>
        <div className="detail-block">
          <h3 className="block-title">중량 변화 (최근 1시간)</h3>
          <WeightChart history={station.history} transitions={station.transitions} />
        </div>
      </div>

      {/* 판정 근거·통신 | 상태 전환 기록 */}
      <div className="detail-row">
        <div className="detail-block detail-info">
          <div>
            <h3 className="block-title">판정 근거</h3>
            <ul className="reason-list">
              {j.reason.map((r) => (
                <li key={r}>
                  <Emph text={r} />
                </li>
              ))}
            </ul>
          </div>
          {/* 실물 지점은 유선·외부 전원이라 신호·배터리가 없고, 마지막 수신은 위 숫자 카드에 있다 */}
          {!station.real && (
            <div>
              <h3 className="block-title">통신 상태</h3>
              <CommStatus station={station} now={now} showLast={false} />
            </div>
          )}
        </div>
        <div className="detail-block">
          <h3 className="block-title">상태 전환 기록</h3>
          <Timeline transitions={station.transitions} />
        </div>
      </div>
    </section>
  );
}
