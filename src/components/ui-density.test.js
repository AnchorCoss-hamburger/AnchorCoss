// refactor/ui: 화면 밀도 줄이기 (상단바 시연 옵션 접기 · 요약 필터 해제 · 우선순위 행 단순화 · 지도 상습 표시)
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScenarioControls } from "./ScenarioControls.jsx";
import { Summary } from "./Summary.jsx";
import { PriorityList } from "./PriorityList.jsx";

const noop = () => {};
const sim = (over = {}) => ({
  playing: false,
  speed: 1,
  rainOverride: null,
  setPlaying: noop,
  step: noop,
  setSpeed: noop,
  setRain: noop,
  reset: noop,
  ...over,
});
const controls = (props) =>
  renderToStaticMarkup(
    createElement(ScenarioControls, { sim: sim(), mode: "sim", onMode: noop, onWeatherDemo: noop, ...props }),
  );

describe("상단바: 시연 옵션은 접어 둔다", () => {
  it("+10초·강우 수동·날씨는 '시연 옵션' 안에 있다", () => {
    const out = controls();
    const more = out.slice(out.indexOf('class="ctl-more"'));
    expect(out).toContain("시연 옵션");
    expect(more).toContain("+10초");
    expect(more).toContain("강우 수동");
    expect(more).toContain("날씨 상황");
    // 접힌 메뉴 밖(앞부분)에는 없다
    const outside = out.slice(0, out.indexOf('class="ctl-more"'));
    expect(outside).not.toContain("+10초");
    expect(outside).not.toContain("강우 수동");
  });

  it("재생·배속·모드·처음부터는 항상 보인다", () => {
    const out = controls();
    const outside = out.slice(0, out.indexOf('class="ctl-more"'));
    for (const t of ["재생", "1×", "5×", "20×", "시뮬레이션", "실시간", "처음부터"]) expect(outside).toContain(t);
  });

  it("켜 둔 옵션은 접힌 버튼에 표시된다", () => {
    expect(controls()).not.toContain("ctl-more-state");
    const out = controls({ sim: sim({ rainOverride: 12 }), weatherDemo: "warning" });
    expect(out).toContain("ctl-more-state");
    expect(out).toMatch(/강우 12mm\/h · 호우특보/);
  });

  it("재생 중에는 +10초를 누를 수 없다", () => {
    expect(controls({ sim: sim({ playing: true }) })).toMatch(/<button[^>]*disabled=""[^>]*>\+10초/);
  });

  it("실시간 모드에는 시연 옵션이 없다", () => {
    const weather = { data: null, error: null, loading: true, refresh: noop };
    const feed = { status: "idle" };
    expect(controls({ mode: "live", weather, feed })).not.toContain("시연 옵션");
  });
});

const st = (id, state, score, extra = {}) => ({
  id,
  name: `빗물받이 #${id}`,
  real: true, // 실물 → 가상 수거 기록 없음 (상습 태그 영향 제거)
  scenarioId: "normal",
  judgement: { state, score, flags: [], ...extra },
});

describe("상태 요약: 필터 해제 버튼은 필터가 있을 때만", () => {
  const html = (state) =>
    renderToStaticMarkup(
      createElement(Summary, { stations: [st("1", "normal", 10)], source: "all", onSource: noop, state, onState: noop }),
    );
  it("필터가 없으면 버튼이 없다", () => {
    expect(html(null)).not.toContain("필터 해제");
    expect(html(null)).not.toContain("보는 중");
  });
  it("필터가 있으면 해제 버튼", () => {
    expect(html("danger")).toContain("위험 필터 해제");
  });
});

describe("우선순위 목록: 행은 순위·이름·상태·점수만", () => {
  const stations = [st("1", "danger", 90, { flags: ["raining"] }), st("2", "warn", 40, { flags: ["raining"] })];
  const html = (selectedId) =>
    renderToStaticMarkup(createElement(PriorityList, { stations, selectedId, onSelect: noop }));

  it("점수 막대는 없고 숫자만", () => {
    const out = html(null);
    expect(out).not.toContain("score-bar");
    expect(out).toContain(">90<");
  });

  it("우천 태그는 선택한 행에만, 나머지는 툴팁", () => {
    expect(html(null)).not.toContain("tag is-rain");
    const out = html("1");
    expect(out.match(/tag is-rain/g)).toHaveLength(1);
    expect(out).toMatch(/title="우천"/);
  });
});

describe("지도: 상습 구간 표시는 범례 버튼으로 켜고 끈다", () => {
  it("기본은 꺼짐, 켰을 때만 마커에 is-hot", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/MapView.jsx", "utf8");
    expect(src).toMatch(/useState\(false\);\s*\/\/ 상습 구간/);
    expect(src).toMatch(/const hot = showHot && /);
    expect(src).toMatch(/\[stations, selectedId, ready, route, showHot\]/);
  });
});
