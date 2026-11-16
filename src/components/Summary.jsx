import { STATES, STATE_META } from "../logic/states.js";
import { countByState } from "../ui/format.js";

const ORDER = [STATES.NORMAL, STATES.WARN, STATES.DANGER, STATES.CHECK];
const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검 필요" };
const SOURCES = [
  { id: "all", label: "전체" },
  { id: "real", label: "실물" },
  { id: "virtual", label: "가상" },
];

/**
 * 상태 요약 + 필터 (DESIGN.md 5장 Summary)
 * - 실물/가상 선택: 개수와 목록·지도가 선택한 지점만 대상으로 바뀐다
 * - 상태 칸을 누르면 그 상태만 보기, 다시 누르거나 "전체 상태"를 누르면 해제
 * stations: 실물/가상 필터를 적용한 지점 (상태 필터 적용 전)
 */
export function Summary({ stations, source, onSource, state, onState }) {
  const counts = countByState(stations);
  return (
    <section className="card" aria-label="상태 요약">
      <div className="summary-head">
        <div className="card-title summary-title">
          상태 요약 <span className="muted">· {stations.length}개 지점</span>
        </div>
        <span className="btn-group" role="group" aria-label="실물·가상 지점 선택">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              className={`btn btn-sm${source === s.id ? " is-active" : ""}`}
              aria-pressed={source === s.id}
              onClick={() => onSource(s.id)}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>
      <div className="summary-grid">
        {ORDER.map((st) => {
          const n = counts[st];
          const on = state === st;
          return (
            <button
              key={st}
              className={`summary-cell st-${st}${on ? " is-on" : ""}${state && !on ? " is-dim" : ""}`}
              aria-pressed={on}
              onClick={() => onState(on ? null : st)}
              title={on ? "필터 해제" : `${SHORT[st]} 지점만 보기`}
            >
              <span className="summary-label">
                <span aria-hidden="true">{STATE_META[st].icon}</span> {SHORT[st]}
              </span>
              <span className="summary-num num">{n}</span>
            </button>
          );
        })}
      </div>
      <button
        className={`btn btn-sm summary-all${state == null ? " is-active" : ""}`}
        aria-pressed={state == null}
        onClick={() => onState(null)}
      >
        {state == null ? "전체 상태 보는 중" : "전체 상태 보기"}
      </button>
    </section>
  );
}
