// 대시보드 레이아웃 (docs/DESIGN.md 4장)
// useSimulation()은 여기서 한 번만 호출하고, 하위 컴포넌트에는 props로 내려준다.
// 페이지(#/ 메인, #/station/<id> 지점 상세, #/route 수거 경로)를 옮겨도 시뮬레이션은 이어진다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSimulation } from "./sim/useSimulation.js";
import { useWeather } from "./sim/useWeather.js";
import { useSensorFeed } from "./sim/useSensorFeed.js";
import { useRoute } from "./sim/useRoute.js";
import { DEFAULT_STATIONS } from "./sim/simulator.js";
import { TopBar } from "./components/TopBar.jsx";
import { Summary } from "./components/Summary.jsx";
import { PriorityList } from "./components/PriorityList.jsx";
import { MapView } from "./components/MapView.jsx";
import { DrainDetail } from "./components/DrainDetail.jsx";
import { RoutePanel } from "./components/RoutePanel.jsx";
import { StationCard } from "./components/StationCard.jsx";
import { Alerts } from "./components/Toasts.jsx";
import { collectTargets, filterStations } from "./ui/format.js";
import { useHashRoute, navigate, paths } from "./ui/router.js";
import { DEPOT } from "./config.js";

// 실물 센서를 연결할 지점 (기본: 빗물받이 #1)
const REAL_STATION_ID = DEFAULT_STATIONS.find((s) => s.real)?.id ?? null;

export default function App() {
  const sim = useSimulation();
  const page = useHashRoute();
  const openStation = useCallback((id) => navigate(paths.station(id)), []);

  // 데이터 모드
  //  "sim":  모든 지점 가상, 강우는 시나리오 또는 수동 입력
  //  "live": 강우는 기상청 실측(모든 지점), 실물 지점(#1)은 서버에 저장된 센서 데이터, 나머지 지점은 가상
  const [mode, setMode] = useState("sim");
  const live = mode === "live";

  const weather = useWeather({ enabled: live });
  const liveRain = weather.data?.rainMm;
  useEffect(() => {
    if (live) {
      if (liveRain != null) sim.setRain(liveRain);
    } else {
      sim.setRain(null);
    }
    // runId: "처음부터"로 시뮬레이터가 새로 만들어져도 다시 적용
  }, [live, liveRain, sim.runId, sim.setRain]);

  useEffect(() => {
    sim.setRealStations(live && REAL_STATION_ID ? [REAL_STATION_ID] : []);
  }, [live, sim.runId, sim.setRealStations]);

  const { ingestReal } = sim;
  const onSamples = useCallback((samples, opt) => ingestReal(REAL_STATION_ID, samples, opt), [ingestReal]);
  const feed = useSensorFeed({ enabled: live, stationId: REAL_STATION_ID, onSamples, resetKey: sim.runId });
  const realStation = sim.stations.find((s) => s.id === REAL_STATION_ID) ?? null;

  // 메인 필터: 실물/가상, 상태 (페이지를 옮겨도 유지)
  const [source, setSource] = useState("all");
  const [stateFilter, setStateFilter] = useState(null);
  const bySource = useMemo(() => filterStations(sim.stations, { source }), [sim.stations, source]);
  const shown = useMemo(() => filterStations(bySource, { state: stateFilter }), [bySource, stateFilter]);
  // 메인에서 선택한 지점 → 지도 위 요약 카드 (필터로 빠지면 숨김)
  const [selectedId, setSelectedId] = useState(null);
  const selected = shown.find((s) => s.id === selectedId) ?? null;

  // 수거 경로 (수거 경로 페이지에서만 계산): 위험(+주의) 지점을 출발지에서 도는 순서와 도로 경로
  const [routeWarn, setRouteWarn] = useState(true);
  const targets = useMemo(() => collectTargets(sim.stations, { includeWarn: routeWarn }), [sim.stations, routeWarn]);
  const route = useRoute({ enabled: page.page === "route", depot: DEPOT, points: targets });

  const station = page.page === "station" ? (sim.stations.find((s) => s.id === page.id) ?? null) : null;
  // 메인에서 요약 카드가 열려 있으면 알림 팝업을 카드 왼쪽으로 비켜 띄운다 (styles.css .has-card)
  const cardOpen = page.page === "main" && selected != null;

  return (
    <div className={`app${page.page === "main" || page.page === "route" ? " is-fit" : ""}${page.page === "station" ? " on-station" : ""}${cardOpen ? " has-card" : ""}`}>
      {/* 상단바 + 위험 배너는 스크롤해도 위에 고정 */}
      <div className="sticky-head">
        <TopBar
          sim={sim}
          mode={mode}
          onMode={setMode}
          weather={weather}
          feed={feed}
          realStation={realStation}
          page={page.page}
        />
        {/* key=runId: "처음부터"를 누르면 알림 닫기 기록·토스트도 초기화 */}
        <Alerts key={sim.runId} stations={sim.stations} events={sim.events} onSelect={openStation} />
      </div>

      {page.page === "main" && (
        <div className="layout">
          <aside className="layout-side">
            <Summary
              stations={bySource}
              source={source}
              onSource={setSource}
              state={stateFilter}
              onState={setStateFilter}
            />
            <PriorityList
              stations={shown}
              events={sim.events}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />
          </aside>
          <main className="layout-main">
            <MapView stations={shown} selectedId={selected?.id ?? null} onSelect={setSelectedId}>
              {selected && (
                <StationCard
                  key={selected.id}
                  station={selected}
                  now={sim.now}
                  onClose={() => setSelectedId(null)}
                  onDetail={() => openStation(selected.id)}
                />
              )}
            </MapView>
          </main>
        </div>
      )}

      {page.page === "station" && (
        <main className="page is-narrow">
          {station ? (
            <DrainDetail
              station={station}
              now={sim.now}
              onCollect={sim.collect}
              onScenario={sim.setScenario}
              backHref={paths.main()}
            />
          ) : (
            <section className="card">
              <a className="back-link btn btn-sm" href={paths.main()}>
                ← 대시보드
              </a>
              <p className="muted">지점을 찾을 수 없습니다 ({page.id}).</p>
            </section>
          )}
        </main>
      )}

      {page.page === "route" && (
        <main className="page route-page">
          <MapView
            stations={sim.stations}
            onSelect={openStation}
            route={route.data}
            depot={DEPOT}
            tall
            label="수거 경로 지도"
          />
          <RoutePanel
            includeWarn={routeWarn}
            onIncludeWarn={setRouteWarn}
            route={route}
            stations={sim.stations}
            depotName={DEPOT.name}
            onSelect={openStation}
          />
        </main>
      )}
    </div>
  );
}
