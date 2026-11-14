import { describe, it, expect } from "vitest";
import { haversineM, straightRoute, buildTripUrl, parseTrip, routeKey, validateRouteInput } from "./route.js";

const depot = { lat: 36.63, lng: 127.46 };
const A = { id: "a", lat: 36.631, lng: 127.46 }; // 출발지에서 약 111m 북쪽
const B = { id: "b", lat: 36.64, lng: 127.46 }; // 약 1.1km 북쪽
const C = { id: "c", lat: 36.63, lng: 127.47 }; // 약 890m 동쪽

describe("haversineM", () => {
  it("위도 0.01도 ≈ 1.11km", () => {
    expect(haversineM({ lat: 36, lng: 127 }, { lat: 36.01, lng: 127 })).toBeCloseTo(1112, -1);
  });
  it("같은 점은 0", () => {
    expect(haversineM(depot, depot)).toBe(0);
  });
});

describe("straightRoute", () => {
  it("가까운 지점부터 방문하고 출발지로 돌아온다", () => {
    const r = straightRoute(depot, [B, C, A]);
    expect(r.source).toBe("straight");
    expect(r.order).toEqual(["a", "c", "b"]); // a(출발지에서 111m) → c(a에서 약 900m) → b(a에서 약 1km)
    expect(r.path[0]).toEqual([depot.lat, depot.lng]);
    expect(r.path.at(-1)).toEqual([depot.lat, depot.lng]);
    expect(r.path).toHaveLength(5);
  });
  it("거리 합과 시간(20km/h)", () => {
    const r = straightRoute(depot, [A]);
    expect(r.distanceM).toBeCloseTo(2 * haversineM(depot, A), 0);
    expect(r.durationS).toBe(Math.round(r.distanceM / (20000 / 3600)));
  });
  it("대상이 없으면 빈 경로", () => {
    expect(straightRoute(depot, [])).toMatchObject({ source: "empty", order: [], path: [] });
  });
});

describe("OSRM trip", () => {
  it("요청 주소: 경도,위도 순서, 출발지가 처음", () => {
    const url = buildTripUrl("https://osrm.example/", depot, [A]);
    expect(url).toBe(
      "https://osrm.example/trip/v1/driving/127.460000,36.630000;127.460000,36.631000?source=first&roundtrip=true&overview=full&geometries=geojson",
    );
  });

  it("응답의 waypoint_index로 방문 순서를 만든다", () => {
    const json = {
      code: "Ok",
      waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
      trips: [{ distance: 1234.4, duration: 300.6, geometry: { coordinates: [[127.46, 36.63], [127.47, 36.64]] } }],
    };
    const r = parseTrip(json, [A, B]);
    expect(r).toEqual({ source: "osrm", order: ["b", "a"], path: [[36.63, 127.46], [36.64, 127.47]], distanceM: 1234, durationS: 301 });
  });

  it("오류 응답이면 예외", () => {
    expect(() => parseTrip({ code: "NoTrips", message: "x" }, [A])).toThrow(/NoTrips/);
    expect(() => parseTrip({ code: "Ok", waypoints: [], trips: [{}] }, [A])).toThrow(/형식/);
  });
});

describe("routeKey", () => {
  it("지점 순서가 달라도 같은 키", () => {
    expect(routeKey(depot, [A, B])).toBe(routeKey(depot, [B, A]));
    expect(routeKey(depot, [A, B])).not.toBe(routeKey(depot, [A, C]));
  });
});

describe("validateRouteInput", () => {
  it("정상 입력은 필요한 필드만 남긴다", () => {
    const r = validateRouteInput({ depot, points: [{ ...A, extra: 1 }] });
    expect(r.points).toEqual([A]);
  });
  it("잘못된 입력은 거절", () => {
    expect(() => validateRouteInput({ points: [] })).toThrow(/출발지/);
    expect(() => validateRouteInput({ depot, points: "x" })).toThrow(/points/);
    expect(() => validateRouteInput({ depot, points: [{ id: "a", lat: "36", lng: 127 }] })).toThrow(/형식/);
    expect(() => validateRouteInput({ depot, points: [A, A] })).toThrow(/중복/);
    expect(() => validateRouteInput({ depot, points: [A, B, C] }, 2)).toThrow(/최대 2개/);
  });
});
