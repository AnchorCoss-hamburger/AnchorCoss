// 비 예보 기반 사전 수거 권고 (위험 알림 아래 한 줄)
// "비가 오면 쓰레기가 빨리 쌓이고 막히면 침수로 이어지므로, 주의 단계 지점은 비 오기 전에 비운다"
// 실시간 모드: 기상청 초단기예보 / 시뮬레이션 모드: "비 예보(시연)" 스위치

import { STATES } from "../logic/states.js";
import { fmtHM, fmtG } from "../ui/format.js";

/**
 * @param {{ advisory: null | { ts:number, rainMm:number, now:number, demo?:boolean }, stations: object[], onSelect: (id:string)=>void }} props
 */
export function RainAdvisory({ advisory, stations, onSelect }) {
  if (!advisory) return null;
  const min = Math.max(0, Math.round((advisory.ts - advisory.now) / 60000));
  const when = min <= 0 ? "지금 시간대" : min < 60 ? `약 ${min}분 뒤` : `약 ${Math.round(min / 60)}시간 뒤`;
  const warns = stations.filter((s) => s.judgement.state === STATES.WARN);

  return (
    <div className="rain-advisory" role="status">
      <strong className="rain-advisory-title">
        <span aria-hidden="true">☔</span> {when}({fmtHM(advisory.ts)}) 비 예보
        {advisory.rainMm >= 1 && <span className="rain-advisory-mm"> · 시간당 약 {advisory.rainMm}mm</span>}
        {advisory.demo && <span className="tag rain-advisory-demo">시연</span>}
      </strong>
      {warns.length ? (
        <>
          <span className="rain-advisory-text">주의 {warns.length}곳은 비 오기 전 수거 권장</span>
          <ul className="alert-chips" aria-label="미리 수거할 주의 지점">
            {warns.map((s) => (
              <li key={s.id}>
                <button className="alert-chip is-warn" onClick={() => onSelect(s.id)} title="눌러서 지점 보기">
                  {s.name.replace("빗물받이 ", "")}
                  <span className="alert-chip-g num">{fmtG(s.judgement.metrics?.totalG)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span className="rain-advisory-text muted">미리 수거할 주의 지점은 없습니다</span>
      )}
    </div>
  );
}
