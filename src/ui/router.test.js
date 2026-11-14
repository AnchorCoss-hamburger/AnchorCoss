import { describe, it, expect } from "vitest";
import { parseHash, paths } from "./router.js";

describe("parseHash", () => {
  it("페이지 구분", () => {
    expect(parseHash("")).toEqual({ page: "main", id: null });
    expect(parseHash("#/")).toEqual({ page: "main", id: null });
    expect(parseHash("#/route")).toEqual({ page: "route", id: null });
    expect(parseHash("#/station/st-3")).toEqual({ page: "station", id: "st-3" });
    expect(parseHash("#/station")).toEqual({ page: "main", id: null });
    expect(parseHash("#/없는페이지")).toEqual({ page: "main", id: null });
  });
  it("paths와 왕복", () => {
    expect(parseHash(paths.station("st-12"))).toEqual({ page: "station", id: "st-12" });
    expect(parseHash(paths.route()).page).toBe("route");
  });
});
