// 지점·임계값 설정. 판정 로직은 이 값만 참조한다 (하드코딩 금지).
// 기획서 4.8·4.9 — 하드웨어팀 1차 답변(로드셀 2개, 오차 ±100g 가정, 수거 후보 250/500/1000g) 기준.
// 로드셀 2개를 HX711 하나로 합쳐 총 중량 하나만 들어온다 (좌/우 구분 없음).
// 실측 전 예상값이므로 센서 정격·기준값을 받은 뒤 다시 보정한다.

// 기상청 대상 지역 (기획서 7장). 기상청 격자는 5km 단위라 동네 수준이면 충분하다.
// 격자 좌표(nx, ny)는 lib/kma.js의 latLngToGrid()가 위경도로 계산한다 (충북대 부근 → 68, 106).
export const REGION = {
  name: "청주 충북대 부근",
  lat: 36.6286,
  lng: 127.4561,
};

// 지도 초기 중심. 가상 지점 좌표는 이 주변에 배치된다 (src/sim/simulator.js)
export const MAP_CENTER = { lat: REGION.lat, lng: REGION.lng, zoom: 15 };

// 수거 경로의 출발·복귀 지점 (임시: 충북대 동쪽 도로변. 실제 차고지·청소 사무소가 정해지면 교체)
export const DEPOT = { name: "출발지", lat: REGION.lat + 0.0012, lng: REGION.lng + 0.0045 };

// 기상특보 (기상청_기상특보 조회서비스): 아래 종류가 아래 지역 이름에 걸리면 화면 맨 위에 경고
export const WARNING = Object.freeze({
  KINDS: ["호우", "태풍"], // 특보 이름에 이 글자가 들어가면 (호우주의보·호우경보·태풍주의보 …)
  AREA_KEYWORDS: ["청주", "충청북도", "충북"], // 특보 지역 문구에 이 글자가 들어가면 우리 지역
});

// 비 예보 기반 사전 수거 권고 (기상청 초단기예보)
export const FORECAST = Object.freeze({
  LOOKAHEAD_H: 3, // 앞으로 몇 시간 안의 비 예보를 알릴지
  DEMO_LEAD_MIN: 60, // 시뮬레이션 "날씨: 비 예보": 몇 분 뒤 비가 온다고 할지 (시뮬레이션 시각 기준)
  DEMO_RAIN_MM: 5, // 시연용 예보 강수량 (mm/h, 보통 비). 그 시각이 되면 강우 수동 입력으로 실제로 비가 내린다
  DEMO_WARNING_RAIN_MM: 30, // 시연 "호우특보"를 고르면 바로 내리는 비 (mm/h)
});

export const ROUTE = Object.freeze({
  DEBOUNCE_MS: 1500, // 수거 대상이 바뀐 뒤 이 시간 동안 더 안 바뀌면 경로를 다시 계산 (OSRM 호출 수 절약)
  STRAIGHT_SPEED_KMH: 20, // 직선 대체 경로의 예상 시간 계산용 평균 속도 (시내 주행 가정)
  MAX_POINTS: 30, // 한 번에 계산할 최대 지점 수
});

export const TH = Object.freeze({
  WARN_TOTAL_G: 250, // 주의 기준 = 하드웨어 1단계 (총 중량, g)
  MID_TOTAL_G: 500, // 중간 눈금 = 하드웨어 2단계. 상태는 바꾸지 않고 근거 문구·그래프·게이지에 표시
  DANGER_TOTAL_G: 1000, // 위험·수거 기준 = 하드웨어 3단계 (총 중량, g)
  RATE_FAST_G_MIN: 40, // 급증 플래그 기준 (분당 g)
  RATE_WINDOW_MIN: 10, // 증가 속도 계산 구간 (분)
  RATE_MIN_SPAN_MIN: 5, // 증가 속도를 계산하기 위한 최소 데이터 구간 (분). 짧으면 노이즈로 급증 오탐
  SMOOTH_SEC: 30, // 판정에 쓰는 이동 중앙값 구간 (초). 노이즈(±100g)·순간 충격 완화
  RAIN_MM_H: 1, // 우천 판정 기준 (mm/h)
  DEBOUNCE_SEC: 30, // 새 상태 조건이 이 시간 이상 지속돼야 상태 변경
  MAX_JUMP_G: 450, // 직전 샘플 대비 이 이상 변하면 일시 이상치로 간주
  RECOVER_RATIO: 0.65, // 위험/주의에서 내려올 때 기준값 배율 (오차 ±100g에서도 경계 깜빡임 방지)
  STALE_SEC: 300, // 마지막 수신 후 이 시간 지나면 통신 두절 (센서는 1초 주기 전송 가정)
  MAX_VALID_G: 2400, // 센서 유효 최대값 (총 중량, g). 정격(1kg ×2 가정) + 여유, 초과는 센서 이상·포화로 처리
  GAUGE_MAX_G: 1500, // 게이지 눈금 최대 (총 중량, g). 수거 기준(1,000g) 위로 여유를 둔 표시용 값
});
