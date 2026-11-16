// 기상특보 경고 줄 (화면 맨 위, 위험 알림보다 위)
// 우리 지역(청주·충북)에 호우·태풍 특보가 발효 중이면 진한 경고, 예비특보만 있으면 옅은 안내.
// 실시간 모드: 기상청 특보 현황 / 시뮬레이션 모드: "호우특보(시연)" 스위치

/**
 * @param {{ warnings: null | { active: {kind, areas}[], preliminary: {kind, when, areas}[], demo?: boolean } }} props
 */
export function WarningBanner({ warnings }) {
  if (!warnings) return null;
  const { active = [], preliminary = [], demo } = warnings;
  if (active.length) {
    return (
      <div className="wx-warning is-active" role="alert">
        <strong>
          <span aria-hidden="true">⛈</span> {active.map((w) => w.kind).join(" · ")} 발효 중
        </strong>
        <span className="wx-areas">{active[0].areas}</span>
        <span className="wx-action">침수 위험 — 위험·주의 지점 즉시 점검·수거</span>
        {demo && <span className="tag">시연</span>}
      </div>
    );
  }
  if (preliminary.length) {
    const p = preliminary[0];
    return (
      <div className="wx-warning is-pre" role="status">
        <strong>
          <span aria-hidden="true">⚠</span> {p.kind}
        </strong>
        <span className="wx-areas">
          {p.when} · {p.areas}
        </span>
        <span className="wx-action">특보 발효 전 주의 지점 미리 수거 권장</span>
        {demo && <span className="tag">시연</span>}
      </div>
    );
  }
  return null;
}
