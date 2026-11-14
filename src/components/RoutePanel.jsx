// 수거 경로 패널: 켜기/끄기 · 대상 범위(위험만 / 위험+주의) · 총 거리·시간 · 방문 순서
// 경로 계산은 useRoute(App에서 호출), 지도에 선을 그리는 것은 MapView가 한다.

import { fmtDistance, fmtDuration } from "../ui/format.js";

const SOURCE_LABEL = {
  osrm: { text: "실제 도로", hint: "오픈스트리트맵 도로 기준 (OSRM)" },
  cache: { text: "저장된 도로 경로", hint: "인터넷 연결이 없어 이전에 받아 둔 경로를 표시" },
  straight: { text: "직선 추정", hint: "도로 경로를 받지 못해 직선 거리로 계산 (실제보다 짧음)" },
};

export function RoutePanel({ enabled, onToggle, includeWarn, onIncludeWarn, route, stations, depotName, onSelect }) {
  const data = route.data;
  const nameOf = new Map(stations.map((s) => [s.id, s.name]));
  const src = data && SOURCE_LABEL[data.source];

  return (
    <section className="card route-card" aria-label="수거 경로">
      <div className="route-head">
        <div className="card-title route-title">수거 경로</div>
        <div className="route-actions">
          <span className="btn-group" role="group" aria-label="경로에 넣을 지점">
            <button className={`btn${!includeWarn ? " is-active" : ""}`} aria-pressed={!includeWarn} onClick={() => onIncludeWarn(false)}>
              위험만
            </button>
            <button className={`btn${includeWarn ? " is-active" : ""}`} aria-pressed={includeWarn} onClick={() => onIncludeWarn(true)}>
              위험+주의
            </button>
          </span>
          <button className={`btn${enabled ? " is-active" : " is-primary"}`} aria-pressed={enabled} onClick={() => onToggle(!enabled)}>
            {enabled ? "경로 숨기기" : "경로 보기"}
          </button>
        </div>
      </div>

      {!enabled ? (
        <p className="route-empty">수거가 필요한 지점을 도는 가장 빠른 순서와 실제 도로 경로를 지도에 표시합니다.</p>
      ) : !data ? (
        <p className="route-empty" role="status">경로 계산 중…</p>
      ) : data.source === "empty" ? (
        <p className="route-empty" role="status">지금은 수거할 지점이 없습니다.</p>
      ) : (
        <>
          <div className="route-summary" role="status">
            <span className="route-metric">
              <b className="num">{data.order.length}</b>곳
            </span>
            <span className="route-metric">
              <b className="num">{fmtDistance(data.distanceM)}</b>
            </span>
            <span className="route-metric">
              <b className="num">{fmtDuration(data.durationS)}</b> 이동
            </span>
            {src && (
              <span className={`tag route-src is-${data.source}`} title={src.hint}>
                {src.text}
              </span>
            )}
            {route.loading && <span className="route-loading">갱신 중…</span>}
          </div>
          {route.warning && <p className="route-warning">{route.warning}</p>}
          <ol className="route-steps" aria-label="방문 순서">
            <li className="route-step is-depot">{depotName}</li>
            {data.order.map((id, i) => (
              <li key={id} className="route-step">
                <button className="route-stop" onClick={() => onSelect(id)}>
                  <span className="route-no num" aria-hidden="true">{i + 1}</span>
                  {nameOf.get(id) ?? id}
                </button>
              </li>
            ))}
            <li className="route-step is-depot">{depotName} 복귀</li>
          </ol>
        </>
      )}
    </section>
  );
}
