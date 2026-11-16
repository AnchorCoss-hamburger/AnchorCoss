// 선택 지점 요약 카드 (메인 지도 오른쪽, 네이버 지도의 장소 카드처럼 지도 위에 띄움)
// 가벼운 정보만 보여 주고, 그래프·타임라인 등은 "상세 보기"로 지점 상세 페이지에서 본다.

import { StateBadge, FlagTags } from "./StateBadge.jsx";
import {
  fmtAgo,
  fmtG,
  fmtStage,
  fmtTime,
  fmtDuration,
  etaToDanger,
  toChartData,
  downsample,
  sparkPath,
} from "../ui/format.js";
import { STATES, STATE_META } from "../logic/states.js";
import { TH } from "../config.js";

const SPARK_W = 260;
const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검" };
const RECENT = 3; // 최근 상태 변화 몇 건

/** 수거 기준 도달 예상 문장 */
function etaText(m, state) {
  if (state === STATES.CHECK) return { text: "점검 필요 — 예측할 수 없음", tone: "check" };
  const e = etaToDanger(m.totalG, m.rateGPerMin, TH.DANGER_TOTAL_G);
  if (e.kind === "over") return { text: `이미 수거 기준(${fmtG(TH.DANGER_TOTAL_G)}) 초과`, tone: "danger" };
  if (e.kind === "eta")
    return {
      text: `${fmtDuration(e.minutes * 60)} 뒤 도달`,
      sub: `분당 약 ${Math.round(m.rateGPerMin)}g씩 증가 중`,
      tone: e.minutes <= 30 ? "warn" : "normal",
    };
  if (e.kind === "flat") return { text: "늘지 않는 중", sub: "지금 속도로는 도달하지 않음", tone: "normal" };
  return { text: "계산 중", sub: "증가 속도를 구하려면 5분 이상 데이터가 필요", tone: null };
}

const SPARK_H = 44;

/** 최근 총 중량 추세 (선 하나 + 주의·수거 기준 점선만) */
function Sparkline({ history, state }) {
  const data = downsample(toChartData(history), 80);
  if (data.length < 2) return <p className="spark-empty">추세를 그릴 데이터가 아직 부족합니다.</p>;
  const peak = Math.max(0, ...data.map((d) => d.total ?? 0));
  const maxG = Math.max(TH.MAX_VALID_G, Math.ceil((peak * 1.1) / 100) * 100);
  const { line, area } = sparkPath(data, { width: SPARK_W, height: SPARK_H, maxG });
  const y = (g) => SPARK_H - (g / maxG) * SPARK_H;
  const min = Math.max(1, Math.round((data[data.length - 1].ts - data[0].ts) / 60000));
  return (
    <figure className="spark" aria-label={`최근 ${min}분 총 중량 추세`}>
      <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className={`spark-svg st-${state}`}>
        <line className="spark-th is-warn" x1="0" x2={SPARK_W} y1={y(TH.WARN_TOTAL_G)} y2={y(TH.WARN_TOTAL_G)} />
        <line className="spark-th is-danger" x1="0" x2={SPARK_W} y1={y(TH.DANGER_TOTAL_G)} y2={y(TH.DANGER_TOTAL_G)} />
        <path className="spark-area" d={area} />
        <path className="spark-line" d={line} />
      </svg>
      <figcaption className="spark-cap">
        <span>최근 {min}분</span>
        <span>
          <span className="spark-key is-warn" aria-hidden="true" /> 주의 {fmtG(TH.WARN_TOTAL_G)}
          <span className="spark-key is-danger" aria-hidden="true" /> 수거 {fmtG(TH.DANGER_TOTAL_G)}
        </span>
      </figcaption>
    </figure>
  );
}

export function StationCard({ station, now: simNow, onClose, onDetail }) {
  const j = station.judgement;
  const m = j.metrics ?? {};
  // 실물 지점은 실제 시계, 가상 지점은 시뮬레이터 시계 기준
  const now = station.clockNow ?? simNow;
  const rain = station.latest?.rainMm;

  return (
    <aside className={`station-card is-${j.state}`} aria-label={`${station.name} 요약`}>
      <div className="station-card-head">
        <div className="station-card-title">
          <h2>{station.name}</h2>
          <span className="tag">{station.real ? "실물" : "가상"}</span>
        </div>
        <button className="station-card-close" onClick={onClose} aria-label="요약 닫기">
          ✕
        </button>
      </div>

      <div className="station-card-badges">
        <StateBadge state={j.state} pending={j.pending} />
        <FlagTags flags={j.flags} />
      </div>

      <dl className="station-card-grid">
        <div className="is-wide">
          <dt>총 중량</dt>
          <dd>
            <span className="num station-card-total">{fmtG(m.totalG)}</span>
            <Sparkline history={station.history} state={j.state} />
          </dd>
        </div>
        <div>
          <dt>수거 단계</dt>
          <dd className="num">{fmtStage(m.stage)}</dd>
        </div>
        <div>
          <dt>막힘 점수</dt>
          <dd className="num">{j.score ?? "—"}</dd>
        </div>
        <div>
          <dt>강우</dt>
          <dd className="num">{rain == null ? "—" : `${rain}mm/h`}</dd>
        </div>
        <div>
          <dt>마지막 수신</dt>
          <dd className={`num${j.state === STATES.CHECK ? " tx-check" : ""}`}>{fmtAgo(now, station.latest?.ts)}</dd>
        </div>
      </dl>

      {(() => {
        const e = etaText(m, j.state);
        return (
          <section className="station-card-sec" aria-label="수거 기준 도달 예상">
            <h3>수거 기준 도달 예상</h3>
            <p className={`station-card-eta${e.tone ? ` tx-${e.tone}` : ""}`}>{e.text}</p>
            {e.sub && <p className="station-card-sub">{e.sub}</p>}
          </section>
        );
      })()}

      <section className="station-card-sec is-recent" aria-label="최근 상태 변화">
        <h3>최근 상태 변화</h3>
        {station.transitions.length === 0 ? (
          <p className="station-card-sub">아직 변화 없음</p>
        ) : (
          <ol className="station-card-recent">
            {station.transitions.slice(0, RECENT).map((t) => (
              <li key={t.id}>
                <span className="num muted">{fmtTime(t.ts).slice(0, 5)}</span>
                <span className={`log-dot st-${t.from}`} aria-label={STATE_META[t.from]?.label}>
                  {STATE_META[t.from]?.icon}
                </span>
                <span className="muted" aria-hidden="true">
                  →
                </span>
                <span className={`log-dot st-${t.to}`} aria-label={STATE_META[t.to]?.label}>
                  {STATE_META[t.to]?.icon}
                </span>
                <span className={`tx-${t.to}`}>{SHORT[t.to]}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 점검 필요일 때만 원인 한 줄 (통신 두절·센서 이상) — 나머지 근거는 위 숫자와 겹친다 */}
      {j.state === STATES.CHECK && j.reason?.[0] && <p className="station-card-reason">{j.reason[0]}</p>}

      <button className="btn is-primary station-card-more" onClick={onDetail}>
        상세 보기 →
      </button>
    </aside>
  );
}
