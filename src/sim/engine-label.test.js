import { describe, it, expect } from "vitest";
import { createEngine } from "./engine.js";
import { createSimulator, DEFAULT_STATIONS } from "./simulator.js";

const nameOf = (e, id) => e.snapshot().stations.find((s) => s.id === id).name;
const make = () => createEngine({ sim: createSimulator({ seed: 1, startTs: 0 }) });

describe("실물 지점 이름 표기 (센서 데이터를 실제로 받아야 '(실물)')", () => {
  const real = DEFAULT_STATIONS.find((s) => s.real);

  it("기본 설정 이름은 그대로 (서버 지점 등록 등에서 쓰임)", () => {
    expect(real.name).toBe("빗물받이 #1 (실물)");
  });

  it("실물 데이터로 연결되기 전(시뮬레이션 모드)에는 '(실물·연결 전)'으로 표시", () => {
    const e = make();
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물·연결 전)");
  });

  it("실시간 모드로 바꿔도 센서 데이터가 오기 전에는 '연결 전' (이름만으로 연결로 오해하지 않게)", () => {
    const e = make();
    e.setRealStations([real.id]);
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물·연결 전)");
    expect(e.snapshot().stations.find((s) => s.id === real.id).connected).toBe(false);
  });

  it("방금 센서가 보낸 값을 받으면 '(실물)'", () => {
    let wall = 1_000_000;
    const e = createEngine({ sim: createSimulator({ seed: 1, startTs: 0 }), wallClock: () => wall });
    e.setRealStations([real.id]);
    e.ingestReal(real.id, [{ stationId: real.id, ts: wall - 1000, weightG: 120 }]);
    const st = e.snapshot().stations.find((s) => s.id === real.id);
    expect(st.name).toBe("빗물받이 #1 (실물)");
    expect(st.connected).toBe(true);
  });

  it("서버에 남아 있던 오래된 기록만 받으면 연결로 보지 않는다", () => {
    const wall = 10_000_000;
    const e = createEngine({ sim: createSimulator({ seed: 1, startTs: 0 }), wallClock: () => wall });
    e.setRealStations([real.id]);
    e.ingestReal(real.id, [{ stationId: real.id, ts: wall - 3_600_000, weightG: 120 }]);
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물·연결 전)");
  });

  it("연결된 뒤 신호가 끊겨도 이름은 유지 (판정만 '점검 필요')", () => {
    let wall = 1_000_000;
    const e = createEngine({ sim: createSimulator({ seed: 1, startTs: 0 }), wallClock: () => wall });
    e.setRealStations([real.id]);
    e.ingestReal(real.id, [{ stationId: real.id, ts: wall - 1000, weightG: 120 }]);
    expect(e.snapshot().stations.find((s) => s.id === real.id).connected).toBe(true);
    wall += 10 * 60 * 1000;
    expect(nameOf(e, real.id)).toBe("빗물받이 #1 (실물)");
  });

  it("시뮬레이션 모드로 돌아가면 다시 '연결 전'", () => {
    let wall = 1_000_000;
    const e = createEngine({ sim: createSimulator({ seed: 1, startTs: 0 }), wallClock: () => wall });
    e.setRealStations([real.id]);
    e.ingestReal(real.id, [{ stationId: real.id, ts: wall - 1000, weightG: 120 }]);
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
