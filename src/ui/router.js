// 페이지 이동 (주소 뒤 #/... 방식, 라이브러리 없음)
//   #/                메인 (요약·우선순위·지도)
//   #/station/<id>    지점 상세
//   #/route           수거 경로
//   #/compare         판정 비교 (단순 임계값 vs 우리 방식)
// 해시 방식이라 새로고침·뒤로 가기가 동작하고, 정적 배포(Vercel)에서도 별도 설정이 필요 없다.
// 페이지를 옮겨도 App은 그대로라 시뮬레이션은 끊기지 않는다.

import { useEffect, useState } from "react";

/** "#/station/st-3" → { page: "station", id: "st-3" } */
export function parseHash(hash) {
  const parts = (hash ?? "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "station" && parts[1]) return { page: "station", id: parts[1] };
  if (parts[0] === "route") return { page: "route", id: null };
  if (parts[0] === "compare") return { page: "compare", id: null };
  return { page: "main", id: null };
}

export const paths = {
  main: () => "#/",
  station: (id) => `#/station/${encodeURIComponent(id)}`,
  route: () => "#/route",
  compare: () => "#/compare",
};

export function navigate(hash) {
  if (window.location.hash !== hash) window.location.hash = hash;
  window.scrollTo(0, 0);
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
