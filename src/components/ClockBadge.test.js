import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClockBadge } from "./ClockBadge.jsx";

const T = Date.parse("2026-11-16T22:47:16+09:00");
const html = (props) => renderToStaticMarkup(createElement(ClockBadge, { simNow: T, playing: true, ...props }));

describe("ClockBadge (상단바 시계)", () => {
  it("항상 '시뮬레이션'이라고 표시한다 (실제 시각으로 오해하지 않게)", () => {
    expect(html({ live: false })).toContain("시뮬레이션");
    expect(html({ live: true })).toContain("시뮬레이션");
  });

  it("시뮬레이션 모드에서는 실제 시각을 보여주지 않는다", () => {
    expect(html({ live: false })).not.toContain("topbar-real");
    expect(html({ live: false })).not.toMatch(/실제 \d\d:\d\d:\d\d/);
  });

  it("실시간 모드에서는 실제 시각(HH:MM:SS)을 함께 보여준다", () => {
    const out = html({ live: true });
    expect(out).toMatch(/실제 \d\d:\d\d:\d\d/);
  });

  it("일시정지 표시와 점 상태", () => {
    expect(html({ live: false, playing: false })).toContain("일시정지");
    expect(html({ live: false, playing: false })).not.toContain("is-on");
    expect(html({ live: false, playing: true })).not.toContain("일시정지");
    expect(html({ live: false, playing: true })).toContain("is-on");
  });

  it("TopBar가 ClockBadge를 쓰고 실시간 모드 여부를 넘긴다", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/TopBar.jsx", "utf8");
    expect(src).toMatch(/<ClockBadge[^>]*live=\{mode === "live"\}/);
  });
});
