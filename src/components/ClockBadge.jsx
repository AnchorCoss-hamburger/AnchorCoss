// 상단바 시계. 이 시각은 **시뮬레이션 시각**(가상 지점이 따르는 시계, 실제보다 빠르게 흐름)이다.
// 실시간 모드에서는 실물 지점이 실제 시각을 따르므로, 헷갈리지 않게 실제 시각을 함께 보여 준다.

import { useEffect, useState } from "react";
import { fmtTime } from "../ui/format.js";

const fmtSim = (ts) =>
  new Date(ts).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

function RealClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  return (
    <span className="topbar-real" title="실제 시각 (실물 센서 기준)">
      {" "}
      · 실제 {fmtTime(now)}
    </span>
  );
}

/** @param {{ simNow: number, playing: boolean, live: boolean }} props live: 실시간 모드 */
export function ClockBadge({ simNow, playing, live }) {
  return (
    <span
      className="topbar-clock num"
      title="시뮬레이션 시각: 가상 지점이 따르는 시계라 실제보다 빠르게 흐릅니다 (재생 속도에 따라)"
    >
      <span className={`live-dot${playing ? " is-on" : ""}`} aria-hidden="true" />
      <span className="topbar-clock-label">시뮬레이션</span> {fmtSim(simNow)}
      {!playing && <span className="muted"> · 일시정지</span>}
      {live && <RealClock />}
    </span>
  );
}
