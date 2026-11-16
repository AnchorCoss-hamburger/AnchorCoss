import { describe, it, expect, vi } from "vitest";
import {
  fcstBaseTime,
  parseFcst,
  kstToTs,
  todayNcstBases,
  fetchTodayRain,
  latLngToGrid,
  ncstBaseTime,
  buildNcstUrl,
  parseNcst,
  parseRainMm,
  fetchNcst,
  KmaError,
} from "./kma.js";

// 2026-11-05 17:xx KST 실제 응답 (충북대가 아닌 테스트 격자 73,134)
const SAMPLE = JSON.stringify({
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
    body: {
      dataType: "JSON",
      items: {
        item: [
          ["PTY", "0"], ["REH", "39"], ["RN1", "0"], ["T1H", "17.8"],
          ["UUU", "0.9"], ["VEC", "228"], ["VVV", "0.8"], ["WSD", "1.2"],
        ].map(([category, obsrValue]) => ({ baseDate: "20261105", baseTime: "1700", category, nx: 73, ny: 134, obsrValue })),
      },
    },
  },
});

const KST = (iso) => Date.parse(`${iso}+09:00`);

describe("latLngToGrid", () => {
  it("기상청 공식 격자와 일치", () => {
    expect(latLngToGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 }); // 서울시청
    expect(latLngToGrid(36.6286, 127.4561)).toEqual({ nx: 68, ny: 106 }); // 청주 충북대 부근
  });
});

describe("ncstBaseTime", () => {
  it("40분 이후면 그 시각, 이전이면 한 시간 전", () => {
    expect(ncstBaseTime(KST("2026-11-05T17:45:00"))).toEqual({ baseDate: "20261105", baseTime: "1700" });
    expect(ncstBaseTime(KST("2026-11-05T17:10:00"))).toEqual({ baseDate: "20261105", baseTime: "1600" });
  });

  it("자정 직후는 전날 23시", () => {
    expect(ncstBaseTime(KST("2026-11-06T00:20:00"))).toEqual({ baseDate: "20261105", baseTime: "2300" });
  });

  it("hoursBack으로 더 이전", () => {
    expect(ncstBaseTime(KST("2026-11-05T17:45:00"), 1).baseTime).toBe("1600");
  });
});

describe("buildNcstUrl", () => {
  it("Decoding 키를 인코딩해서 넣는다", () => {
    const u = buildNcstUrl({ key: "a+b/c==", nx: 68, ny: 106, baseDate: "20261105", baseTime: "1700" });
    expect(u.toString()).toContain("serviceKey=a%2Bb%2Fc%3D%3D");
    expect(u.searchParams.get("nx")).toBe("68");
    expect(u.searchParams.get("dataType")).toBe("JSON");
  });
});

describe("parseRainMm", () => {
  it("숫자·예보형 문자열·결측", () => {
    expect(["0", "1.5", "강수없음", "1mm 미만", "30.0~50.0mm", "50.0mm 이상", "-998.9", null].map(parseRainMm)).toEqual([
      0, 1.5, 0, 0.5, 30, 50, 0, 0,
    ]);
  });
});

describe("parseNcst", () => {
  it("실제 응답 파싱", () => {
    expect(parseNcst(SAMPLE)).toEqual({
      baseDate: "20261105",
      baseTime: "1700",
      nx: 73,
      ny: 134,
      rainMm: 0,
      pty: 0,
      ptyLabel: "강수 없음",
      tempC: 17.8,
      humidity: 39,
      windMs: 1.2,
    });
  });

  it("resultCode 오류", () => {
    const bad = JSON.stringify({ response: { header: { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" } } });
    expect(() => parseNcst(bad)).toThrow(KmaError);
    expect(() => parseNcst(bad)).toThrow(/10/);
  });

  it("인증키 오류는 XML로 온다", () => {
    const xml =
      "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>" +
      "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    try {
      parseNcst(xml);
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe("30");
      expect(e.message).toContain("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    }
  });
});

describe("fetchNcst", () => {
  const ok = (text) => ({ ok: true, status: 200, text: async () => text });
  const noData = JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } });

  it("정상 조회", async () => {
    const f = vi.fn(async () => ok(SAMPLE));
    const r = await fetchNcst({ key: "k", nx: 68, ny: 106, now: KST("2026-11-05T17:45:00"), fetchImpl: f });
    expect(r.tempC).toBe(17.8);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0].searchParams.get("base_time")).toBe("1700");
  });

  it("NO_DATA면 한 시간 전으로 재시도", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok(noData)).mockResolvedValueOnce(ok(SAMPLE));
    await fetchNcst({ key: "k", nx: 68, ny: 106, now: KST("2026-11-05T17:45:00"), fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0].searchParams.get("base_time")).toBe("1600");
  });

  it("HTTP 오류", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500, text: async () => "" }));
    await expect(fetchNcst({ key: "k", nx: 1, ny: 1, fetchImpl: f })).rejects.toThrow(/HTTP500/);
  });
});

describe("초단기예보 (getUltraSrtFcst)", () => {
  // KST 2026-11-16 14:50 = UTC 05:50
  const NOW = Date.UTC(2026, 10, 16, 5, 50);

  it("발표 시각: 45분 이후면 이번 시각 30분, 전이면 한 시간 전", () => {
    expect(fcstBaseTime(NOW)).toEqual({ baseDate: "20261116", baseTime: "1430" });
    expect(fcstBaseTime(Date.UTC(2026, 10, 16, 5, 40))).toEqual({ baseDate: "20261116", baseTime: "1330" });
    expect(fcstBaseTime(Date.UTC(2026, 10, 15, 15, 10))).toEqual({ baseDate: "20261115", baseTime: "2330" }); // KST 00:10
  });

  it("응답 → 시각별 강수량 (문자열 범주 포함)", () => {
    const item = (t, category, v) => ({ baseDate: "20261116", baseTime: "1430", category, fcstDate: "20261116", fcstTime: t, fcstValue: v, nx: 68, ny: 106 });
    const text = JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: {
          items: {
            item: [
              item("1600", "RN1", "1.0mm"), item("1600", "PTY", "1"), item("1600", "T1H", "8"),
              item("1500", "RN1", "강수없음"), item("1500", "PTY", "0"),
              item("1700", "RN1", "1mm 미만"), item("1700", "PTY", "5"),
            ],
          },
        },
      },
    });
    const r = parseFcst(text);
    expect(r.baseTime).toBe("1430");
    expect(r.hours.map((h) => [new Date(h.ts).getUTCHours(), h.rainMm, h.pty])).toEqual([
      [6, 0, 0], // KST 15시
      [7, 1, 1],
      [8, 0.5, 5],
    ]);
  });

  it("KST 날짜·시각 → epoch", () => {
    expect(kstToTs("20261116", "1500")).toBe(Date.UTC(2026, 10, 16, 6, 0));
  });
});

describe("오늘 누적 강수량", () => {
  it("합산할 관측 시각: 01시 ~ 가장 최근 관측", () => {
    // KST 14:50 → 14시 관측까지
    expect(todayNcstBases(Date.UTC(2026, 10, 16, 5, 50)).map((b) => b.baseTime)).toEqual(
      Array.from({ length: 14 }, (_, i) => `${String(i + 1).padStart(2, "0")}00`),
    );
    expect(todayNcstBases(Date.UTC(2026, 10, 15, 15, 30))).toEqual([]); // KST 00:30 — 아직 오늘 관측 없음
  });

  it("시각별로 저장해 두고 새 시각만 조회해서 더한다", async () => {
    const rainBy = { "0100": "0", "0200": "1.5", "0300": "2" };
    const fetchImpl = vi.fn(async (url) => {
      const t = new URL(url).searchParams.get("base_time");
      const body = {
        response: {
          header: { resultCode: "00", resultMsg: "OK" },
          body: { items: { item: [{ baseDate: "20261116", baseTime: t, category: "RN1", obsrValue: rainBy[t] ?? "0", nx: 68, ny: 106 }] } },
        },
      };
      return { ok: true, text: async () => JSON.stringify(body) };
    });
    const cache = new Map();
    const now = Date.UTC(2026, 10, 15, 18, 50); // KST 03:50
    expect(await fetchTodayRain({ key: "k", nx: 68, ny: 106, now, fetchImpl, cache })).toBe(3.5);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await fetchTodayRain({ key: "k", nx: 68, ny: 106, now, fetchImpl, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 저장분 재사용
  });
});
