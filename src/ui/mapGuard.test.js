import { describe, it, expect } from "vitest";
import { guardWheelZoom } from "./mapGuard.js";

/** Leaflet 지도의 필요한 부분만 흉내 */
function fakeMap() {
  const handlers = {};
  const map = {
    wheel: true,
    scrollWheelZoom: {
      enable: () => (map.wheel = true),
      disable: () => (map.wheel = false),
    },
    on: (ev, fn) => (handlers[ev] = fn),
    fire: (ev) => handlers[ev]?.(),
  };
  return map;
}

describe("guardWheelZoom", () => {
  it("처음에는 휠 줌이 꺼진다 (스크롤은 페이지로)", () => {
    const m = fakeMap();
    guardWheelZoom(m);
    expect(m.wheel).toBe(false);
  });

  it("지도를 클릭하면 켜지고, 마우스가 지도를 벗어나면 다시 꺼진다", () => {
    const m = fakeMap();
    guardWheelZoom(m);
    m.fire("click");
    expect(m.wheel).toBe(true);
    m.fire("mouseout");
    expect(m.wheel).toBe(false);
  });

  it("벗어났다가 다시 들어와도 클릭 전에는 꺼져 있다", () => {
    const m = fakeMap();
    guardWheelZoom(m);
    m.fire("click");
    m.fire("mouseout");
    expect(m.wheel).toBe(false); // 다시 올려 두기만 해서는 켜지지 않음
    m.fire("click");
    expect(m.wheel).toBe(true);
  });
});

describe("MapView 연결", () => {
  it("지도를 만들 때 휠 줌 옵션을 끄고 보호 함수를 호출한다", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/components/MapView.jsx", "utf8");
    expect(src).toMatch(/scrollWheelZoom:\s*false/);
    expect(src).toMatch(/guardWheelZoom\(map\)/);
  });
});
