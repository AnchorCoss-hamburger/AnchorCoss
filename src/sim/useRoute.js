// 수거 경로를 서버(/api/route)에서 받아 오는 훅.
// 수거 대상 지점 묶음이 바뀌고 잠시(ROUTE.DEBOUNCE_MS) 그대로이면 다시 계산한다 (매 틱 호출하지 않음).
// 서버에 연결할 수 없으면(npm run preview 등) 화면에서 직선 경로를 직접 계산한다.
//
// const route = useRoute({ enabled, depot, points });
// route.data     Route (lib/route.js) | null
// route.warning  대체 경로를 쓰는 이유 | null
// route.loading  true/false

import { useEffect, useMemo, useRef, useState } from "react";
import { ROUTE } from "../config.js";
import { routeKey, straightRoute, emptyRoute } from "../../lib/route.js";

export function useRoute({ enabled, depot, points }) {
  const [state, setState] = useState({ data: null, warning: null, loading: false });

  // points 배열은 매 틱 새로 만들어지므로 내용(키)이 바뀔 때만 다시 계산
  const key = useMemo(() => routeKey(depot, points), [depot, points]);
  const latest = useRef({ depot, points });
  latest.current = { depot, points };

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, warning: null, loading: false });
      return undefined;
    }
    const { depot: d, points: ps } = latest.current;
    const body = { depot: { lat: d.lat, lng: d.lng }, points: ps.map(({ id, lat, lng }) => ({ id, lat, lng })) };
    if (!body.points.length) {
      setState({ data: emptyRoute(), warning: null, loading: false });
      return undefined;
    }

    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    // 처음 켤 때는 바로, 그 뒤 대상이 바뀔 때는 잠시 기다렸다가 계산
    const delay = state.data ? ROUTE.DEBOUNCE_MS : 0;
    const h = setTimeout(async () => {
      try {
        const r = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        let j;
        try {
          j = await r.json();
        } catch {
          throw new Error("경로 서버에 연결할 수 없습니다 (npm run dev로 실행했는지 확인)");
        }
        if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
        const { ok: _ok, warning, ...data } = j;
        setState({ data, warning: warning ?? null, loading: false });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setState({ data: straightRoute(body.depot, body.points), warning: `${e.message} — 직선으로 표시합니다`, loading: false });
      }
    }, delay);

    return () => {
      clearTimeout(h);
      ctrl.abort();
    };
    // state.data는 지연 여부 판단에만 쓰므로 의존성에서 제외
  }, [enabled, key]);

  return state;
}
