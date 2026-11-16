import { ScenarioControls } from "./ScenarioControls.jsx";
import { paths } from "../ui/router.js";

const NAV = [
  { page: "main", label: "대시보드", href: paths.main() },
  { page: "route", label: "수거 경로", href: paths.route() },
  { page: "compare", label: "판정 비교", href: paths.compare() },
];

const fmtClock = (ts) =>
  new Date(ts).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

/** 상단바: 제목 · 시뮬레이션 시각 · 페이지 이동 · 시연 제어(전체 적용) */
export function TopBar({ sim, mode, onMode, weather, feed, realStation, page, weatherDemo, onWeatherDemo }) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>
          <a className="topbar-home" href={paths.main()} title="대시보드(메인)로">
            빗물받이 막힘 감지 대시보드
          </a>
        </h1>
        <span className="topbar-clock num" title="시뮬레이션 시각 (가상 지점 기준)">
          <span className={`live-dot${sim.playing ? " is-on" : ""}`} aria-hidden="true" />
          {fmtClock(sim.now)}
          {!sim.playing && <span className="muted"> · 일시정지</span>}
        </span>
      </div>
      <ScenarioControls
        sim={sim}
        mode={mode}
        onMode={onMode}
        weather={weather}
        feed={feed}
        realStation={realStation}
        weatherDemo={weatherDemo}
        onWeatherDemo={onWeatherDemo}
      />
      <nav className="page-tabs" aria-label="페이지">
        {NAV.map((n) => (
          <a
            key={n.page}
            href={n.href}
            className={`page-tab${page === n.page ? " is-active" : ""}`}
            aria-current={page === n.page ? "page" : undefined}
          >
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
