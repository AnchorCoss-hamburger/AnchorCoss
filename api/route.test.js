import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import handler, { _clearCache } from "./route.js";

const depot = { lat: 36.63, lng: 127.46 };
const points = [
  { id: "st-1", lat: 36.631, lng: 127.46 },
  { id: "st-2", lat: 36.64, lng: 127.46 },
];

const OSRM_OK = {
  code: "Ok",
  waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
  trips: [{ distance: 2500, duration: 420, geometry: { coordinates: [[127.46, 36.63], [127.46, 36.64], [127.46, 36.63]] } }],
};

function fakeRes() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

const post = async (body) => {
  const res = fakeRes();
  await handler({ method: "POST", body }, res);
  return res;
};

const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => OSRM_OK }));
const downFetch = () => vi.fn(async () => { throw new Error("fetch failed"); });

describe("api/route", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "route-"));
    process.env.ROUTE_CACHE_PATH = path.join(dir, "cache.json");
    _clearCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ROUTE_CACHE_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("GET은 405", async () => {
    const res = fakeRes();
    await handler({ method: "GET" }, res);
    expect(res.statusCode).toBe(405);
  });

  it("잘못된 본문은 400", async () => {
    const res = await post({ points: [] });
    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("대상이 없으면 OSRM을 부르지 않고 빈 경로", async () => {
    const f = okFetch();
    vi.stubGlobal("fetch", f);
    const res = await post({ depot, points: [] });
    expect(res.body).toMatchObject({ ok: true, source: "empty", order: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it("OSRM 성공 → 도로 경로, 파일에 저장", async () => {
    vi.stubGlobal("fetch", okFetch());
    const res = await post({ depot, points });
    expect(res.body).toMatchObject({ ok: true, source: "osrm", order: ["st-2", "st-1"], distanceM: 2500, durationS: 420 });
    expect(res.body.path[0]).toEqual([36.63, 127.46]);
    expect(fs.existsSync(process.env.ROUTE_CACHE_PATH)).toBe(true);
  });

  it("OSRM 실패 + 저장분 있음 → 저장된 경로 (서버를 다시 켜도 파일에서 복원)", async () => {
    vi.stubGlobal("fetch", okFetch());
    await post({ depot, points });
    _clearCache(); // 서버 재시작 흉내 (메모리 비움, 파일은 남음)
    vi.stubGlobal("fetch", downFetch());
    const res = await post({ depot, points: [...points].reverse() }); // 순서가 달라도 같은 경로
    expect(res.body).toMatchObject({ ok: true, source: "cache", order: ["st-2", "st-1"] });
    expect(res.body.warning).toMatch(/저장된 경로/);
  });

  it("OSRM 실패 + 저장분 없음 → 직선 경로", async () => {
    vi.stubGlobal("fetch", downFetch());
    const res = await post({ depot, points });
    expect(res.body).toMatchObject({ ok: true, source: "straight", order: ["st-1", "st-2"] });
    expect(res.body.warning).toMatch(/직선/);
  });

  it("OSRM 오류 응답(code ≠ Ok)도 직선으로 대체", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ code: "NoTrips" }) })));
    const res = await post({ depot, points });
    expect(res.body.source).toBe("straight");
    expect(res.body.warning).toMatch(/NoTrips/);
  });
});
