import { useState } from "react";
import { WeatherInfo } from "./WeatherInfo.jsx";
import { SensorFeedBadge } from "./SensorFeedBadge.jsx";
import { TH } from "../config.js";

const SPEEDS = [1, 5, 20];
const RAIN_MAX = 30;

/**
 * 시연 제어 (전체 지점에 적용): 재생/일시정지 · 배속 · 데이터 모드(시뮬레이션/실시간) · 처음부터
 * 자주 안 쓰는 +10초·강우 수동·날씨는 "시연 옵션"으로 접어 둔다 (시뮬레이션 모드에서만).
 * 지점 하나를 조작하는 시나리오 변경·수거는 상세 패널(DrainDetail)에 있다.
 */
export function ScenarioControls({
  sim,
  mode,
  onMode,
  weather,
  feed,
  realStation,
  weatherDemo = "none",
  onWeatherDemo,
}) {
  const manualRain = sim.rainOverride != null;
  const [lastRain, setLastRain] = useState(15); // 체크를 껐다 켜도 마지막 값 유지

  const setRain = (mm) => {
    setLastRain(mm);
    sim.setRain(mm);
  };

  // 접힌 상태에서도 켜 둔 옵션은 버튼에 보이게
  const activeOpts = [];
  if (manualRain) activeOpts.push(`강우 ${sim.rainOverride}mm/h`);
  if (weatherDemo === "forecast") activeOpts.push("비 예보");
  if (weatherDemo === "warning") activeOpts.push("호우특보");

  return (
    <div className="controls" role="toolbar" aria-label="시연 제어">
      <div className="control-group">
        <button
          className="btn is-primary"
          onClick={() => sim.setPlaying(!sim.playing)}
          aria-label={sim.playing ? "일시정지" : "재생"}
        >
          {sim.playing ? "⏸ 일시정지" : "▶ 재생"}
        </button>
        <span className="btn-group" role="group" aria-label="배속">
          {SPEEDS.map((n) => (
            <button
              key={n}
              className={`btn${sim.speed === n ? " is-active" : ""}`}
              aria-pressed={sim.speed === n}
              onClick={() => sim.setSpeed(n)}
            >
              {n}×
            </button>
          ))}
        </span>
      </div>

      <span className="control-sep" aria-hidden="true" />

      <div className="control-group">
        <span className="btn-group" role="group" aria-label="데이터 모드">
          <button
            className={`btn${mode === "sim" ? " is-active" : ""}`}
            aria-pressed={mode === "sim"}
            onClick={() => onMode("sim")}
            title="모든 지점 가상 데이터. 강우는 시나리오 또는 수동 입력"
          >
            시뮬레이션
          </button>
          <button
            className={`btn${mode === "live" ? " is-active" : ""}`}
            aria-pressed={mode === "live"}
            onClick={() => onMode("live")}
            title="강우는 기상청 실측, 실물 지점은 서버에 수신된 센서 데이터, 나머지 지점은 가상"
          >
            실시간
          </button>
        </span>

        {mode === "live" ? (
          <>
            <WeatherInfo weather={weather} />
            <SensorFeedBadge feed={feed} station={realStation} />
            <label
              className="control-check"
              title={`시연용: 실물 센서 값이 들어오는 즉시 상태를 바꿈. 끄면 원래 방식(${TH.SMOOTH_SEC}초 중앙값 · ${TH.DEBOUNCE_SEC}초 확정 대기 · 급변 1회 무시) — 실측 비교 실험·툭 치기 시연은 끄고 할 것`}
            >
              <input type="checkbox" checked={sim.fastJudge} onChange={(e) => sim.setFastJudge(e.target.checked)} />
              빠른 반영
            </label>
          </>
        ) : null}
      </div>

      <span className="control-sep" aria-hidden="true" />

      <button className="btn" onClick={sim.reset} title="모든 지점을 처음부터 다시">
        ↺ 처음부터
      </button>

      {mode !== "live" && (
        <details className="ctl-more">
          <summary className="btn" title="한 단계씩 진행 · 강우 직접 입력 · 날씨 상황">
            시연 옵션
            {activeOpts.length > 0 && <span className="ctl-more-state">· {activeOpts.join(" · ")}</span>}
          </summary>
          <div className="ctl-more-panel">
            <div className="ctl-more-row">
              <span className="ctl-more-title">한 단계</span>
              <button
                className="btn btn-sm"
                onClick={sim.step}
                disabled={sim.playing}
                title={sim.playing ? "일시정지 중에만 쓸 수 있습니다" : "10초 진행"}
              >
                +10초
              </button>
            </div>
            <div className="ctl-more-row">
              <label className="control-check">
                <input
                  type="checkbox"
                  checked={manualRain}
                  onChange={(e) => sim.setRain(e.target.checked ? lastRain : null)}
                />
                강우 수동
              </label>
              {manualRain && (
                <>
                  <input
                    type="range"
                    min={0}
                    max={RAIN_MAX}
                    step={1}
                    value={sim.rainOverride}
                    onChange={(e) => setRain(Number(e.target.value))}
                    aria-label="강우량 (mm/h)"
                    className="control-range"
                  />
                  <span className="control-value num">{sim.rainOverride}mm/h</span>
                </>
              )}
            </div>
            {/* 날씨 상황은 하나만 (호우특보면 이미 비가 오는 상황이라 비 예보와 함께 고를 수 없음) */}
            <div className="ctl-more-row">
              <label
                className="detail-scenario"
                title="비 예보: 1시간 뒤 비 예보를 띄우고 그 시각이 되면 실제로 비가 내림 · 호우특보: 호우경보 발효 + 비가 오는 상태"
              >
                <span className="ctl-more-title">날씨</span>
                <select
                  className="control-select"
                  value={weatherDemo}
                  onChange={(e) => onWeatherDemo?.(e.target.value)}
                  aria-label="날씨 상황"
                >
                  <option value="none">맑음</option>
                  <option value="forecast">비 예보</option>
                  <option value="warning">호우특보</option>
                </select>
              </label>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
