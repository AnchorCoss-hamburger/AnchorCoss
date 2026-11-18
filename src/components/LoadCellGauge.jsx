// 로드셀 게이지 (DESIGN.md 5장 LoadCellGauge) — 이 작품의 특징 화면
// 아치형(U자) 거름망 단면 안에 쓰레기가 아래에서 위로 차오르는 모양으로 총 중량을 보여 준다.
// 로드셀 2개를 HX711 하나로 합쳐 읽으므로 값은 총 중량 하나다 (좌/우 구분 없음).
//
// 판정과 어긋나지 않게:
//  - 높이: 가상 지점은 판정이 쓰는 값(최근 30초 중앙값, judgement.metrics.totalG), 실물 수신 중이면 센서 최신값(그래프와 같음)
//  - 채움 색은 지점의 판정 상태를 따른다
//  - 기준선은 판정 기준인 주의(1단계)와 수거(3단계·위험)를 그린다
//  - 센서 이상(음수·측정 실패·범위 초과)은 가장 최근 원시 샘플로 판단해 빗금 + "이상"

import { TH, DEMO_FAST } from "../config.js";
import { STATES } from "../logic/states.js";
import { fmtG } from "../ui/format.js";

const SCALE_MAX = TH.GAUGE_MAX_G; // 눈금 최대 (표시용)
const pct = (v) => `${Math.min(100, Math.max(0, (v / SCALE_MAX) * 100))}%`;
const valid = (v) => v != null && v >= 0 && v <= TH.MAX_VALID_G;

/**
 * @param {{ sample: object|null, metrics: object, state: string, fast?: boolean, raw?: boolean }} props
 *   fast: 시연용 빠른 판정 중, raw: 실물 센서 수신 중 → 센서 최신값을 바로 그림 (그래프와 같은 값)
 *   sample: 가장 최근 원시 샘플 (센서 이상 판단용), metrics: 판정의 평활값
 */
export function LoadCellGauge({ sample, metrics, state, fast = false, raw = false }) {
  // 아직 수신한 샘플이 없을 때 (시나리오 변경 직후 등) — "이상"과 구분해서 표시
  if (!sample) return <p className="muted gauge-empty">수신 대기 중…</p>;

  const fault = !valid(sample.weightG);
  const total = raw ? sample.weightG : (metrics?.totalG ?? sample.weightG); // 가상: 판정 평활값, 실물: 최신값
  const fill = [STATES.NORMAL, STATES.WARN, STATES.DANGER].includes(state) ? state : STATES.NORMAL;

  return (
    <div className="gauge" aria-label={`총 중량 ${fault ? "센서 이상" : fmtG(total)}`}>
      <div className="gauge-body">
        <div className="gauge-tracks">
          <div className="gauge-line is-danger" style={{ bottom: pct(TH.DANGER_TOTAL_G) }}>
            <span>수거 {fmtG(TH.DANGER_TOTAL_G)}</span>
          </div>
          <div className="gauge-line is-warn" style={{ bottom: pct(TH.WARN_TOTAL_G) }}>
            <span>주의 {fmtG(TH.WARN_TOTAL_G)}</span>
          </div>
          <div className="gauge-track">
            {fault ? (
              <>
                <div className="gauge-fill st-check" style={{ height: "100%" }} />
                <span className="gauge-fault">센서 이상</span>
              </>
            ) : (
              <>
                <div className={`gauge-fill st-${fill}`} style={{ height: pct(total) }} />
                {total > SCALE_MAX && <span className="gauge-over">눈금 초과</span>}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="gauge-values num">
        <span>
          총 중량 <b>{fault ? "이상" : fmtG(total)}</b>
        </span>
      </div>
      <p className="gauge-note muted">
        눈금 최대 {fmtG(SCALE_MAX)} ·{" "}
        {raw ? "센서 최신값" : `최근 ${fast ? DEMO_FAST.SMOOTH_SEC : TH.SMOOTH_SEC}초 중앙값${fast ? " (빠른 반영)" : ""}`}
      </p>
    </div>
  );
}
