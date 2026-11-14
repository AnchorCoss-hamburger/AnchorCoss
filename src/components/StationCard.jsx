// 선택 지점 요약 카드 (메인 지도 오른쪽, 네이버 지도의 장소 카드처럼 지도 위에 띄움)
// 가벼운 정보만 보여 주고, 그래프·타임라인 등은 "상세 보기"로 지점 상세 페이지에서 본다.

import { StateBadge, FlagTags } from "./StateBadge.jsx";
import { fmtAgo, fmtG } from "../ui/format.js";
import { STATES } from "../logic/states.js";

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
          <dd className="num station-card-total">{fmtG(m.totalG)}</dd>
        </div>
        <div>
          <dt>좌</dt>
          <dd className="num">{fmtG(m.leftG)}</dd>
        </div>
        <div>
          <dt>우</dt>
          <dd className="num">{fmtG(m.rightG)}</dd>
        </div>
        <div>
          <dt>막힘 점수</dt>
          <dd className="num">{j.score ?? "—"}</dd>
        </div>
        <div>
          <dt>강우</dt>
          <dd className="num">{rain == null ? "—" : `${rain}mm/h`}</dd>
        </div>
        <div className="is-wide">
          <dt>마지막 수신</dt>
          <dd className={`num${j.state === STATES.CHECK ? " tx-check" : ""}`}>{fmtAgo(now, station.latest?.ts)}</dd>
        </div>
      </dl>

      {j.reason?.[0] && <p className="station-card-reason">{j.reason[0]}</p>}

      <button className="btn is-primary station-card-more" onClick={onDetail}>
        상세 보기 →
      </button>
    </aside>
  );
}
