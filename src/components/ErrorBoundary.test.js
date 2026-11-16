import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorBoundary, errorDetail } from "./ErrorBoundary.jsx";

// 테스트 환경(node)에는 DOM이 없어서 실제로 예외를 던지는 렌더는 못 한다.
// 대신 React가 에러 경계에 하는 호출(getDerivedStateFromError → render, componentDidCatch)을 직접 재현한다.
const make = (children = "정상 화면") => {
  const inst = new ErrorBoundary({ children });
  inst.setState = (patch) => {
    inst.state = { ...inst.state, ...patch }; // React가 하는 상태 병합
  };
  return inst;
};
const html = (inst) => renderToStaticMarkup(inst.render());

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window;
});

describe("ErrorBoundary", () => {
  it("오류가 없으면 자식을 그대로 그린다", () => {
    expect(make("정상 화면").render()).toBe("정상 화면");
  });

  it("오류가 나면 안내 화면과 복구 버튼 3개, 오류 문장을 보여 준다", () => {
    const inst = make();
    inst.state = ErrorBoundary.getDerivedStateFromError(new Error("지점 데이터가 비었습니다"));
    const out = html(inst);
    expect(out).toContain("화면에 문제가 생겼습니다");
    expect(out).toContain('role="alert"');
    expect(out).toContain("지점 데이터가 비었습니다");
    for (const label of ["다시 시도", "대시보드로", "새로고침"]) expect(out).toContain(label);
    expect(out).not.toContain("정상 화면");
  });

  it("오류 값이 Error가 아니거나 비어 있어도 안내 화면이 나온다", () => {
    for (const bad of ["문자열 오류", 42, null, undefined]) {
      const inst = make();
      inst.state = ErrorBoundary.getDerivedStateFromError(bad);
      expect(html(inst)).toContain("화면에 문제가 생겼습니다");
    }
  });

  it("오류 문장에 들어 있는 HTML은 이스케이프된다", () => {
    const inst = make();
    inst.state = ErrorBoundary.getDerivedStateFromError(new Error("<img src=x onerror=alert(1)>"));
    const out = html(inst);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("다시 시도하면 오류 상태가 풀려 자식을 다시 그린다", () => {
    const inst = make("정상 화면");
    inst.state = ErrorBoundary.getDerivedStateFromError(new Error("x"));
    inst.retry();
    expect(inst.state.error).toBeNull();
    expect(inst.render()).toBe("정상 화면");
  });

  it("대시보드로: 주소를 #/ 로 바꾸고 오류 상태를 푼다", () => {
    globalThis.window = { location: { hash: "#/compare" } };
    const inst = make();
    inst.state = ErrorBoundary.getDerivedStateFromError(new Error("x"));
    inst.goHome();
    expect(globalThis.window.location.hash).toBe("#/");
    expect(inst.state.error).toBeNull();
  });

  it("오류를 콘솔에 남긴다 (나중에 F12로 원인 확인)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("원인");
    make().componentDidCatch(err, { componentStack: "\n  at Foo" });
    expect(spy).toHaveBeenCalledWith("[화면 오류]", err, "\n  at Foo");
  });
});

describe("errorDetail", () => {
  it("긴 오류 문장은 300자에서 자른다", () => {
    const out = errorDetail(new Error("가".repeat(1000)));
    expect(out.length).toBe(301);
    expect(out.endsWith("…")).toBe(true);
  });

  it("값이 없으면 기본 문구", () => {
    expect(errorDetail(null)).toBe("알 수 없는 오류");
    expect(errorDetail(new Error("짧음"))).toBe("짧음");
  });
});

describe("앱에 연결됨", () => {
  it("main.jsx가 앱을 에러 경계로 감싼다", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/main.jsx", "utf8");
    expect(src).toMatch(/<ErrorBoundary>\s*<App \/>\s*<\/ErrorBoundary>/);
  });

  it("에러 경계를 자식과 함께 그려도 정상 출력이 그대로 나온다", () => {
    const out = renderToStaticMarkup(createElement(ErrorBoundary, null, createElement("p", null, "대시보드")));
    expect(out).toBe("<p>대시보드</p>");
  });
});
