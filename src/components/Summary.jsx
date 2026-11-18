import { STATES, STATE_META } from "../logic/states.js";
import { countByState } from "../ui/format.js";

// 급한 순서 (위험 → 주의 → 점검 → 정상): 막대와 목록 모두 이 순서
const ORDER = [STATES.DANGER, STATES.WARN, STATES.CHECK, STATES.NORMAL];
const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검 필요" };
const SOURCES = [
  { id: "all", label: "전체" },
  { id: "real", label: "실물" },
  { id: "virtual", label: "가상" },
];

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/**
 * 상태 요약 + 필터 (DESIGN.md 5장 Summary)
 * - 한 줄 요약(수거 필요 몇 곳) · 상태 비율 막대 · 상태별 개수 목록
 * - 지점이 수백·수천 개여도 자리를 덜 차지하도록 큰 숫자 칸 대신 작은 목록으로 보여 준다
 * - 실물/가상 선택: 개수와 목록·지도가 선택한 지점만 대상으로 바뀐다
 * - 상태 줄을 누르면 그 상태만 보기, 다시 누르거나 "필터 해제"를 누르면 해제
 * stations: 실물/가상 필터를 적용한 지점 (상태 필터 적용 전)
 * onSource가 없으면(시뮬레이션 모드: 실물 지점 없음) 실물/가상 선택을 숨긴다
 */
export function Summary({ stations, source, onSource, state, onState }) {
  const counts = countByState(stations);
  const total = stations.length;
  const danger = counts[STATES.DANGER] ?? 0;

  return (
    <section className="card summary" aria-label="상태 요약">
      <div className="summary-head">
        <div className="card-title summary-title">상태 요약</div>
        {onSource && (
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
        )}
      </div>

      <p className="summary-lead">
        {danger > 0 ? (
          <>
            <span className="summary-lead-num tx-danger num">{danger.toLocaleString()}곳</span> 수거 필요
          </>
        ) : (
          <span className="summary-lead-ok">수거가 필요한 곳 없음</span>
        )}
        <span className="summary-lead-total">
          전체 <span className="num">{total.toLocaleString()}</span>개 지점
        </span>
      </p>

      {/* 상태 비율 막대 (색만으로 구분하지 않도록 아래 목록에 이름·개수를 함께 둔다) */}
      <div className="summary-bar" aria-hidden="true">
        {total > 0 &&
          ORDER.map((st) =>
            counts[st] ? (
              <span
                key={st}
                className={`summary-bar-seg st-${st}${state && state !== st ? " is-dim" : ""}`}
                style={{ flexGrow: counts[st] }}
              />
            ) : null,
          )}
      </div>

      <ul className="summary-list">
        {ORDER.map((st) => {
          const n = counts[st] ?? 0;
          const on = state === st;
          return (
            <li key={st}>
              <button
                className={`summary-row st-${st}${on ? " is-on" : ""}${state && !on ? " is-dim" : ""}`}
                aria-pressed={on}
                onClick={() => onState(on ? null : st)}
                title={on ? "필터 해제" : `${SHORT[st]} 지점만 보기`}
                disabled={n === 0 && !on}
              >
                <span className={`summary-dot st-${st}`} aria-hidden="true">
                  {STATE_META[st].icon}
                </span>
                <span className="summary-row-label">{SHORT[st]}</span>
                <span className="summary-row-num num">{n.toLocaleString()}</span>
                <span className="summary-row-pct num">{pct(n, total)}%</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 필터가 걸렸을 때만 해제 버튼 (평소엔 자리를 차지하지 않게) */}
      {state != null && (
        <button className="btn btn-sm summary-all" onClick={() => onState(null)}>
          ✕ {SHORT[state]} 필터 해제
        </button>
      )}
    </section>
  );
}
