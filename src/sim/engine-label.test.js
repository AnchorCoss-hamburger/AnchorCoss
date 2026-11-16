import { describe, it, expect } from "vitest";
import { createEngine } from "./engine.js";
import { createSimulator, DEFAULT_STATIONS } from "./simulator.js";

const nameOf = (e, id) => e.snapshot().stations.find((s) => s.id === id).name;
const make = () => createEngine({ sim: createSimulator({ seed: 1, startTs: 0 }) });

describe("실물 지점 이름 표기", () => {
  const real = DEFAULT_STATIONS.find((s) => s.real);

  it("기본 설정 이름은 그대로 (서버 지점 등록 등에서 쓰임)", () => {
    expect(real.name).toBe("빗물받이 #1 (실물)");
  });

  it("실물 데이터로 연결되기 전(시뮬레이션 모드)에는 '(실물·연결 전)'으로 표시", () => {
    const e = make();
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물·연결 전)");
  });

  it("실시간 모드에서 실물 지점으로 지정되면 원래 이름 '(실물)'", () => {
    const e = make();
    e.setRealStations([real.id]);
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물)");
  });

  it("시뮬레이션 모드로 돌아가면 다시 '연결 전'", () => {
    const e = make();
    e.setRealStations([real.id]);
    e.setRealStations([]);
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물·연결 전)");
  });

  it("가상 지점의 이름은 바뀌지 않는다", () => {
    const e = make();
    expect(nameOf(e, "st-2")).toBe("빗물받이 #2");
    e.setRealStations([real.id]);
    expect(nameOf(e, "st-2")).toBe("빗물받이 #2");
  });
});
