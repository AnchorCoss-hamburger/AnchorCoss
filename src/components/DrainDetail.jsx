// 지점 상세 (DESIGN.md 5장 DrainDetail)
// 머리: 돌아가기·이름·상태·조작
// 왼쪽 좁은 열: 로드셀 게이지 · 지점 정보(미니 지도)
// 오른쪽 넓은 열: 숫자 카드 · 중량 그래프(예측선) · 판정 근거·통신 | 상태 비율 | 우천 영향 | 상태 전환 기록
import { StateBadge, FlagTags } from "./StateBadge.jsx";
import { LoadCellGauge } from "./LoadCellGauge.jsx";
import { WeightChart } from "./WeightChart.jsx";
import { CommStatus } from "./CommStatus.jsx";
import { Timeline } from "./Timeline.jsx";
import { StationInfo } from "./StationInfo.jsx";
import { SCENARIOS } from "../sim/scenario.js";
import {
  fmtG,
  fmtAgo,
  fmtStage,
  fmtHM,
  fmtDuration,
  stateDurations,
  rainFillRates,
  etaToDanger,
  forecastLine,
} from "../ui/format.js";
import { TH } from "../config.js";
import { STATES, STATE_META } from "../logic/states.js";

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

const WINDOW_MS = 60 * 60 * 1000; // 최근 1시간
const SHARE_ORDER = [STATES.NORMAL, STATES.WARN, STATES.DANGER, STATES.CHECK];
const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검" };

/** 최근 1시간 상태 비율 막대 */
function StateShare({ station, clock }) {
  const from = Math.max(clock - WINDOW_MS, station.history[0]?.ts ?? clock);
  const span = clock - from;
  if (span < 60_000) return <p className="muted">데이터 수집 중…</p>;
  const d = stateDurations(station.transitions, station.judgement.state, from, clock);
  const parts = SHARE_ORDER.map((st) => ({ st, pct: (d[st] / span) * 100 })).filter((p) => p.pct > 0);
  const min = Math.round(span / 60000);
  return (
    <div className="share">
      <div
        className="share-bar"
        role="img"
        aria-label={parts.map((p) => `${SHORT[p.st]} ${Math.round(p.pct)}%`).join(", ")}
      >
        {parts.map((p) => (
          <span key={p.st} className={`share-seg st-${p.st}`} style={{ width: `${p.pct}%` }} />
        ))}
      </div>
      <ul className="share-legend">
        {parts.map((p) => (
          <li key={p.st}>
            <span className={`share-dot st-${p.st}`} aria-hidden="true">
              {STATE_META[p.st].icon}
            </span>
            {SHORT[p.st]} <b className="num">{Math.round(p.pct)}%</b>
          </li>
        ))}
      </ul>
      <p className="muted share-note">최근 {min}분 기준</p>
    </div>
  );
}

// 1g 미만·음수는 잡음 수준이라 "거의 없음" (짧은 구간에서는 센서 오차 때문에 음수가 나올 수 있음)
const fmtRateShort = (v) => (v == null ? "—" : v < 1 ? "거의 없음" : `분당 +${Math.round(v)}g`);

/** 비 올 때 vs 안 올 때 적재 속도 */
function RainCompare({ history }) {
  const r = rainFillRates(history, { rainMmH: TH.RAIN_MM_H, maxG: TH.MAX_VALID_G });
  const max = Math.max(1, r.rain ?? 0, r.dry ?? 0);
  const bar = (v) => (v == null ? "0%" : `${Math.max(2, (Math.max(0, v) / max) * 100)}%`); // 값이 없으면 막대도 없음
  let msg;
  if (r.rain == null && r.dry == null) msg = "비교할 데이터가 아직 부족합니다 (각각 5분 이상 필요).";
  else if (r.rain == null) msg = "최근 1시간 동안 비가 온 구간이 짧거나 없어 비교할 수 없습니다.";
  else if (r.dry == null) msg = "최근 1시간 동안 계속 비가 왔습니다.";
  else if (r.dry > 0.5 && r.rain > r.dry)
    msg = `비가 올 때 약 ${Math.round((r.rain / r.dry) * 10) / 10}배 빨리 쌓입니다.`;
  else if (r.rain > r.dry) msg = "비가 올 때 더 빨리 쌓입니다.";
  else msg = "비가 와도 쌓이는 속도에 큰 차이가 없습니다.";
  return (
    <div className="rain-cmp">
      <div className="rain-row">
        <span className="rain-label">비 올 때</span>
        <span className="rain-track">
          <span className="rain-fill is-rain" style={{ width: bar(r.rain) }} />
        </span>
        <b className="num">{fmtRateShort(r.rain)}</b>
      </div>
      <div className="rain-row">
        <span className="rain-label">맑을 때</span>
        <span className="rain-track">
          <span className="rain-fill" style={{ width: bar(r.dry) }} />
        </span>
        <b className="num">{fmtRateShort(r.dry)}</b>
      </div>
      <p className="rain-msg">{msg}</p>
    </div>
  );
}

export function DrainDetail({ station, now, onCollect, onScenario, backHref = null }) {
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
  const checking = j.state === STATES.CHECK;
  // 수거 기준 도달 예상 (지금 속도가 이어진다고 가정한 직선 예측) — 점검 필요면 하지 않음
  const eta = checking ? { kind: "unknown" } : etaToDanger(m.totalG, m.rateGPerMin, TH.DANGER_TOTAL_G);
  const forecast = checking
    ? null
    : forecastLine({
        ts: station.latest?.ts,
        totalG: m.totalG,
        rateGPerMin: m.rateGPerMin,
        dangerG: TH.DANGER_TOTAL_G,
      });
  const etaLabel =
    eta.kind === "over"
      ? "이미 초과"
      : eta.kind === "eta"
        ? `${fmtDuration(eta.minutes * 60)} 뒤`
        : eta.kind === "flat"
          ? "늘지 않음"
          : "—";

  return (
    <section className={`card detail is-${j.state}`} aria-label={`${station.name} 상세`}>
      <div className="detail-head">
        {backHref && (
          <a className="back-link btn btn-sm" href={backHref}>
            ← 대시보드
          </a>
        )}
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

      <div className="detail-grid">
        {/* 왼쪽 좁은 열: 게이지 · 지점 정보 */}
        <aside className="detail-side">
          <div className="panel">
            <h3 className="block-title">로드셀</h3>
            <LoadCellGauge sample={station.latest} metrics={j.metrics} state={j.state} />
          </div>
          <div className="panel">
            <h3 className="block-title">지점 정보</h3>
            <StationInfo station={station} />
          </div>
        </aside>

        {/* 오른쪽 넓은 열: 숫자 카드 · 그래프 · 판정 근거 | 상태 비율 | 우천 영향 | 상태 전환 기록 */}
        <div className="detail-main">
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
            <div className="stat" title="현재 증가 속도가 이어진다고 가정한 예상">
              <dt>수거 기준 도달 예상</dt>
              <dd
                className={`num${eta.kind === "over" ? " tx-danger" : eta.kind === "eta" && eta.minutes <= 30 ? " tx-warn" : ""}`}
              >
                {etaLabel}
                {eta.kind === "eta" && station.latest && (
                  <span className="stat-sub"> ({fmtHM(station.latest.ts + eta.minutes * 60000)})</span>
                )}
              </dd>
            </div>
            <div className="stat">
              <dt>강우</dt>
              <dd className="num">{rain == null ? "—" : `${rain}mm/h`}</dd>
            </div>
            <div className="stat">
              <dt>마지막 수신</dt>
              <dd className={`num${j.state === STATES.CHECK ? " tx-check" : ""}`}>
                {fmtAgo(clock, station.latest?.ts)}
              </dd>
            </div>
          </dl>
          <div className="panel">
            <h3 className="block-title">중량 변화 (최근 1시간)</h3>
            <WeightChart history={station.history} transitions={station.transitions} forecast={forecast} />
          </div>
          <div className="detail-row is-four">
            <div className="panel detail-info">
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
              {/* 실물 지점은 유선·외부 전원이라 신호·배터리가 없고, 마지막 수신은 숫자 카드에 있다 */}
              {!station.real && (
                <div>
                  <h3 className="block-title">통신 상태</h3>
                  <CommStatus station={station} now={now} showLast={false} />
                </div>
              )}
            </div>
            <div className="panel">
              <h3 className="block-title">최근 1시간 상태 비율</h3>
              <StateShare station={station} clock={clock} />
            </div>
            <div className="panel">
              <h3 className="block-title">비가 올 때 쌓이는 속도</h3>
              <RainCompare history={station.history} />
            </div>
            <div className="panel">
              <h3 className="block-title">상태 전환 기록</h3>
              <div className="panel-scroll">
                <Timeline transitions={station.transitions} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
