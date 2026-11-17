// 선택 지점 요약 카드 (메인 지도 오른쪽, 네이버 지도의 장소 카드처럼 지도 위에 띄움)
// 가벼운 정보만 보여 주고, 그래프·타임라인 등은 "상세 보기"로 지점 상세 페이지에서 본다.

import { useLayoutEffect, useRef, useState } from "react";
import { StateBadge, FlagTags } from "./StateBadge.jsx";
import { fmtAgo, fmtG, fmtStage, fmtDuration, etaToDanger, toChartData, downsample, sparkPath } from "../ui/format.js";
import { STATES } from "../logic/states.js";
import { TH, HOTSPOT } from "../config.js";
import { collectionHistory } from "../sim/history.js";

const SPARK_W = 260;

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

// 카드가 지도 높이를 넘치면 덜 중요한 것부터 하나씩 숨긴다 (글꼴·화면 배율이 달라도 잘리지 않게).
// 1단계: 추세 그래프 → 2단계: 보조 문구·플래그. 숨긴 내용은 상세 페이지에 있다.
const MAX_COMPACT = 2;

// 다른 지점을 고르면 App에서 key로 카드를 새로 만들어 0단계부터 다시 맞춘다.
function useFitLevel(ref) {
  const [level, setLevel] = useState(0);
  // 지도 크기가 바뀌면 처음부터 다시 맞춘다
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!box) return undefined;
    let lastH = box.clientHeight;
    const ro = new ResizeObserver(() => {
      if (box.clientHeight !== lastH) {
        lastH = box.clientHeight;
        setLevel(0);
      }
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [ref]);
  // 그린 뒤 넘치면 한 단계 더 줄인다 (넘치지 않을 때까지 반복)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || level >= MAX_COMPACT) return;
    if (el.scrollHeight > el.clientHeight + 1) setLevel((l) => Math.min(MAX_COMPACT, l + 1));
  });
  return level;
}

export function StationCard({ station, now: simNow, onClose, onDetail }) {
  const cardRef = useRef(null);
  const compact = useFitLevel(cardRef);
  const j = station.judgement;
  const m = j.metrics ?? {};
  // 실물 지점은 실제 시계, 가상 지점은 시뮬레이터 시계 기준
  const now = station.clockNow ?? simNow;
  const hist = collectionHistory(station);

  return (
    <aside
      ref={cardRef}
      className={`station-card is-${j.state}${compact ? ` compact-${compact}` : ""}`}
      aria-label={`${station.name} 요약`}
    >
      <div className="station-card-head">
        <div className="station-card-title">
          <h2>{station.name}</h2>
          <span className="tag">{station.real ? "실물" : "가상"}</span>
          {hist?.hotspot && (
            <span className="tag is-hot" title={`최근 ${HOTSPOT.DAYS}일 수거 ${hist.total}회 (가상 기록)`}>
              상습
            </span>
          )}
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

      {/* 점검 필요일 때만 원인 한 줄 (통신 두절·센서 이상) — 나머지 근거는 위 숫자와 겹친다 */}
      {j.state === STATES.CHECK && j.reason?.[0] && <p className="station-card-reason">{j.reason[0]}</p>}

      <button className="btn is-primary station-card-more" onClick={onDetail}>
        상세 보기 →
      </button>
    </aside>
  );
}
