import { stateSegments } from "../ui/format.js";

const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검", none: "정답 없음" };

/**
 * 시간에 따른 상태 색 띠 한 줄 (판정 비교 페이지)
 * times를 주면 실제 시각 비율로 폭을 정한다 (실측 기록은 샘플 간격이 고르지 않을 수 있음).
 * 상태 null은 "정답 없음"(회색 빗금)으로 그린다.
 */
export function StateBand({ label, states, times, changes, falseCount, highlight }) {
  const norm = states.map((s) => s ?? "none");
  const segs = stateSegments(norm);
  const n = norm.length || 1;
  const span = times && times.length > 1 ? times[times.length - 1] - times[0] : 0;
  const width = (s) => {
    if (!span) return ((s.end - s.start) / n) * 100;
    const end = s.end < times.length ? times[s.end] : times[times.length - 1];
    return ((end - times[s.start]) / span) * 100;
  };
  return (
    <div className={`band-row${highlight ? " is-ours" : ""}`}>
      <div className="band-label">
        {label}
        {changes != null && (
          <div className="band-meta num">
            변경 {changes}회
            {falseCount != null && (
              <b className={`band-false ${falseCount > 0 ? "tx-danger" : "tx-normal"}`}>오경보 {falseCount}</b>
            )}
          </div>
        )}
      </div>
      <div className="band-track" role="img" aria-label={`${label}: 상태 변경 ${changes ?? 0}회`}>
        {segs.map((s, i) => (
          <span key={i} className={`band-seg st-${s.state}`} style={{ width: `${width(s)}%` }} title={SHORT[s.state]} />
        ))}
      </div>
    </div>
  );
}
