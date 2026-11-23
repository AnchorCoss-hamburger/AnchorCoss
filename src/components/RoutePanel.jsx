// 수거 경로 패널 (수거 경로 페이지): 대상 범위(위험만 / 위험+주의) · 총 거리·시간 · 수거 예상량
// · 방문 순서 표(상태·총 중량·도착 예상) · 경로에서 빠진 지점 안내
// 경로 계산은 useRoute(App에서 호출), 지도에 선을 그리는 것은 MapView가 한다.

import { fmtDistance, fmtDuration, fmtG } from "../ui/format.js";
import { arrivalMinutes } from "../../lib/route.js";
import { STATES, STATE_META } from "../logic/states.js";

const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검" };
const fmtKg = (g) => (g >= 1000 ? `${(g / 1000).toFixed(1)}kg` : fmtG(g));

const SOURCE_LABEL = {
  osrm: { text: "실제 도로", hint: "오픈스트리트맵 도로 기준 (OSRM)" },
  cache: { text: "저장된 도로 경로", hint: "인터넷 연결이 없어 이전에 받아 둔 경로를 표시" },
  straight: { text: "직선 추정", hint: "도로 경로를 받지 못해 직선 거리로 계산 (실제보다 짧음)" },
};

export function RoutePanel({ includeWarn, onIncludeWarn, route, stations, depotName, onSelect }) {
  const data = route.data;
  const byId = new Map(stations.map((s) => [s.id, s]));
  const src = data && SOURCE_LABEL[data.source];
  const stops = (data?.order ?? []).map((id) => byId.get(id)).filter(Boolean);
  const arrive = data ? arrivalMinutes(data) : null;
  const totalLoad = stops.reduce((sum, s) => sum + (s.judgement.metrics?.totalG ?? 0), 0);
  const nDanger = stops.filter((s) => s.judgement.state === STATES.DANGER).length;
  const nWarn = stops.filter((s) => s.judgement.state === STATES.WARN).length;
  // 경로에서 빠진 지점: 점검 필요(무게를 믿을 수 없음), 위험만일 때의 주의 지점
  const checks = stations.filter((s) => s.judgement.state === STATES.CHECK);
  const skippedWarn = includeWarn ? [] : stations.filter((s) => s.judgement.state === STATES.WARN);
  const short = (s) => s.name.replace("빗물받이 ", "");

  return (
    <section className="card route-card" aria-label="수거 경로">
      <div className="route-head">
        <div className="card-title route-title">수거 경로</div>
        <div className="route-actions">
          <span className="btn-group" role="group" aria-label="경로에 넣을 지점">
            <button
              className={`btn${!includeWarn ? " is-active" : ""}`}
              aria-pressed={!includeWarn}
              onClick={() => onIncludeWarn(false)}
            >
              위험만
            </button>
            <button
              className={`btn${includeWarn ? " is-active" : ""}`}
              aria-pressed={includeWarn}
              onClick={() => onIncludeWarn(true)}
            >
              위험+주의
            </button>
          </span>
        </div>
      </div>

      <p className="route-empty route-intro">
        수거가 필요한 지점을 {depotName}에서 출발해 도는 가장 빠른 순서와 도로 경로입니다. 상태가 바뀌면 자동으로 다시
        계산합니다.
      </p>
      {!data ? (
        <p className="route-empty" role="status">
          경로 계산 중…
        </p>
      ) : data.source === "empty" ? (
        <p className="route-empty" role="status">
          지금은 수거할 지점이 없습니다.
        </p>
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
            {route.loading && (
              <span className="route-loading">
                <span className="spinner" aria-hidden="true" />
                경로 갱신 중…
              </span>
            )}
          </div>
          <p className="route-load">
            수거 예상량 <b className="num">약 {fmtKg(totalLoad)}</b>
            <span className="muted">
              {" "}
              · 위험 {nDanger}곳{nWarn ? ` · 주의 ${nWarn}곳` : ""}
            </span>
          </p>
          {route.warning && <p className="route-warning">{route.warning}</p>}

          <table className="route-table" aria-label="방문 순서">
            <thead>
              <tr>
                <th>순서</th>
                <th>지점</th>
                <th>상태</th>
                <th className="num-col">총 중량</th>
                <th className="num-col" title="수거 작업 시간을 뺀 이동 시간 기준">
                  도착
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="is-depot">
                <td>출발</td>
                <td colSpan={3}>{depotName}</td>
                <td className="num-col num">0분</td>
              </tr>
              {stops.map((s, i) => (
                <tr key={s.id} onClick={() => onSelect(s.id)} className="is-stop" title="눌러서 지점 상세 보기">
                  <td>
                    <span className="route-no num">{i + 1}</span>
                  </td>
                  <td className="route-name">{short(s)}</td>
                  <td>
                    <span className={`tx-${s.judgement.state} route-state`}>
                      {STATE_META[s.judgement.state]?.icon} {SHORT[s.judgement.state]}
                    </span>
                  </td>
                  <td className="num-col num">{fmtG(s.judgement.metrics?.totalG)}</td>
                  <td className="num-col num">{arrive ? `${arrive[i]}분` : "—"}</td>
                </tr>
              ))}
              <tr className="is-depot">
                <td>복귀</td>
                <td colSpan={3}>{depotName}</td>
                <td className="num-col num">{Math.round(data.durationS / 60)}분</td>
              </tr>
            </tbody>
          </table>
          <p className="route-note muted">도착 = 출발 후 누적 이동 시간 (수거 작업 시간 제외)</p>

          {(checks.length > 0 || skippedWarn.length > 0) && (
            <div className="route-skipped">
              <h4>경로에서 빠진 지점</h4>
              <ul>
                {checks.length > 0 && (
                  <li>
                    <b className="tx-check">점검 필요 {checks.length}곳</b> ({checks.map(short).join(", ")}) — 무게를
                    믿을 수 없어 제외, 현장 확인 권장
                  </li>
                )}
                {skippedWarn.length > 0 && (
                  <li>
                    <b className="tx-warn">주의 {skippedWarn.length}곳</b> ({skippedWarn.map(short).join(", ")}) —
                    "위험+주의"를 누르면 포함
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
