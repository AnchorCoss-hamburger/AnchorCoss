// 지점 정보 + 미니 지도 (상세 페이지): 이 지점이 어디에 있는지, 어떤 센서인지
// 미니 지도는 위치 확인용이라 끌기·확대를 막는다 (페이지 스크롤과 충돌하지 않게).

import { useEffect, useRef } from "react";
import { STATE_META } from "../logic/states.js";
import { getScenario } from "../sim/scenario.js";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ZOOM = 16;

function MiniMap({ lat, lng, state }) {
  const elRef = useRef(null);
  const ctxRef = useRef(null); // { map, marker }
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let disposed = false;
    import("leaflet").then(({ default: L }) => {
      if (disposed || !elRef.current) return;
      const map = L.map(elRef.current, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        attributionControl: true,
      }).setView([lat, lng], ZOOM);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTR }).addTo(map);
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "map-icon",
          // 만들 때부터 상태색 (일시정지 중에는 다시 그려지지 않으므로)
          html: `<div class="map-marker st-${stateRef.current}">${STATE_META[stateRef.current]?.icon ?? ""}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
      ctxRef.current = { map, marker };
    });
    return () => {
      disposed = true;
      ctxRef.current?.map.remove();
      ctxRef.current = null;
    };
  }, [lat, lng]);

  // 상태가 바뀌면 마커 색·아이콘 갱신
  useEffect(() => {
    const el = ctxRef.current?.marker.getElement()?.querySelector(".map-marker");
    if (!el) return;
    el.className = `map-marker st-${state}`;
    el.textContent = STATE_META[state]?.icon ?? "";
  }, [state]);

  return <div ref={elRef} className="mini-map map" aria-label="지점 위치 지도" />;
}

export function StationInfo({ station }) {
  let scenario = null;
  try {
    scenario = station.live ? null : getScenario(station.scenarioId);
  } catch {
    scenario = null;
  }
  return (
    <div className="station-info">
      <MiniMap lat={station.lat} lng={station.lng} state={station.judgement.state} />
      <dl className="info-list">
        <div>
          <dt>구분</dt>
          <dd>{station.real ? "실물 센서" : "가상 지점"}</dd>
        </div>
        <div>
          <dt>연결</dt>
          <dd>
            {station.real
              ? station.live
                ? "USB 시리얼 · 실시간 수신 중"
                : "USB 시리얼 (지금은 시뮬레이션)"
              : "시뮬레이션"}
          </dd>
        </div>
        <div>
          <dt>좌표</dt>
          <dd className="num">
            {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
          </dd>
        </div>
        {scenario && (
          <div>
            <dt>시나리오</dt>
            <dd>
              {scenario.name} <span className="muted">— {scenario.description}</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
