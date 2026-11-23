# AnchorCoss — 빗물받이 막힘 감지 대시보드

청정강원(coss) x 햄버거(앵커) 팀의 **빗물받이 막힘 감지를 위한 센서 & 오염물 거름망** 작품의 웹 대시보드입니다.

거름망에 쌓이는 쓰레기 무게를 **로드셀 2개**(HX711 하나로 합쳐 **총 중량 1개 값**)로 측정하고, 기상청 강수 정보와 함께 판정해 수거 시점을 알려줍니다.
하드웨어 완성 전에도 개발·시연할 수 있도록 **가상 데이터 생성기**로 동작하며, 실물 센서 데이터도 같은 포맷으로 연결할 수 있게 설계합니다.

> 구현 범위: 웹 대시보드만 (펌웨어·통신·모바일 앱·거름망 제작 제외)

## 상태 체계

| 상태 | 의미 |
|---|---|
| 정상 | 적재 거의 없음 |
| 주의 | 적재 진행 중 |
| 위험 (수거 필요) | 총 중량이 수거 기준 초과 |
| 점검 필요 | 통신 두절 또는 센서 이상 |

보조 표시: 우천 중 · 급증. 알림은 화면 배너/토스트로만 제공합니다.

## 기술 스택

React 19 · Vite 7 · Vitest 3 · Leaflet(지도) · Recharts(그래프) · JavaScript · 순수 CSS

## 시작하기

Node.js 22 이상, npm 필요.

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 판정 로직 테스트
npm run build     # 배포용 빌드 (dist/)
npm run preview   # 빌드 결과 미리보기
npm run dev:host  # 같은 와이파이의 다른 기기(센서)에서 접속 가능하게 실행
npm run fake-sensor # 센서 흉내: 수신 API로 샘플 전송 (npm run dev 실행 중일 때)
npm run serial    # 시리얼 브리지: 아두이노 USB 시리얼 값 → 수신 API (아래 "시리얼 브리지")
npm run db:reset  # 센서 DB 비우기 (-- --yes 로 실제 삭제, 개발 서버를 끄고 실행)
npm run scenario  # 판정 성능 비교표 (제안 방식 vs 단순 임계값)
                  # 예: npm run scenario -- gradual 1  (특정 시나리오 상세, 1분 간격)
                  #     npm run scenario -- all        (전체 상세)
```

## 환경변수

`.env.example`을 `.env.local`로 **복사**해 값을 채웁니다 (`.env.local`은 git에 올라가지 않습니다. `.env.example`은 지우지 마세요).

| 이름 | 설명 |
|---|---|
| `KMA_SERVICE_KEY` | 공공데이터포털 기상청 API 인증키 (Decoding 키) |
| `DEVICE_TOKEN` | 센서 수신 API 인증 토큰 (임의의 긴 문자열, 하드웨어팀에 전달) |
| `DB_PATH` | SQLite 파일 위치 (선택, 기본 `data/anchor.db`) |

키가 없어도 시뮬레이터의 수동 강우 입력으로 개발·시연할 수 있습니다.

## 데이터 모드 (상단바)

| 모드 | 강우 | 빗물받이 #1 (실물 지점) | 나머지 지점 |
|---|---|---|---|
| 시뮬레이션 (기본) | 시나리오 강우, 또는 "강우 수동" 슬라이더 | 가상 | 가상 |
| 실시간 | 기상청 초단기실황 1시간 강수량(RN1), 10분마다 갱신 | **서버에 수신된 센서 데이터** (3초마다 확인, 최근 1시간 복원) | 가상 |

- 실시간 모드에서 실물 데이터가 없으면 #1은 "점검 필요(수신 기록 없음)"으로 표시된다 (가짜 값을 만들지 않음).
- 실물 지점은 **실제 시계**로, 가상 지점은 시뮬레이터 시계(실제보다 빠름)로 판정한다.
- 우천 장면 시연은 시뮬레이션 모드에서 (실시간 모드는 실제 날씨를 쓰므로 맑으면 강우 0).

- 대상 지역: `src/config.js`의 `REGION` (청주 충북대 부근, 기상청 격자 68·106은 위경도로 자동 계산)
- 서버 API: `GET /api/weather[?lat=&lng=]` → `{ ok, region, nx, ny, baseDate, baseTime, rainMm, pty, ptyLabel, tempC, humidity, windMs, forecast, todayRainMm }`
  - `forecast`: 초단기예보(앞으로 6시간) `{ baseDate, baseTime, hours: [{ ts, rainMm, pty }] }` — 같은 "단기예보 조회서비스" 키로 동작
  - `todayRainMm`: 오늘 01시~가장 최근 관측까지 1시간 강수량 합계 (시각별로 저장해 두고 새 시각만 조회)
  - 예보·누적 강수량이 실패해도 실황은 그대로 응답 (`extraWarning`에 이유)
- **비 예보 기반 사전 수거 권고**: 3시간 안에 비 예보가 있으면 위험 알림 아래 파란 줄로 "주의 N곳은 비 오기 전 수거 권장"을 띄운다 (지금 비가 오거나 호우특보가 발효 중이면 표시 안 함). 시뮬레이션 모드에서는 상단 **날씨** 선택(맑음 / 비 예보 / 호우특보, 하나만)으로 시연한다. 비 예보: 1시간 뒤 비 예보가 뜨고 그 시각이 되면 실제로 비(5mm/h)가 내린 뒤 맑음으로 돌아감 · 호우특보: 호우경보 발효 + 비 30mm/h (`src/config.js` `FORECAST`)
- **호우 특보**: "기상청_기상특보 조회서비스"(별도 활용 신청, 같은 키)의 특보 현황(`getPwnStatus`)에서 우리 지역(청주·충북)에 걸린 호우·태풍 특보만 골라 화면 맨 위에 보라색 경고 줄로 띄운다 (발효 중: 진한 경고 / 예비특보: 옅은 안내). `/api/weather` 응답의 `warnings`. 종류·지역 이름은 `src/config.js` `WARNING`. 시뮬레이션 모드에서는 상단 **날씨: 호우특보**
- `/api/weather`는 `npm run dev`(Vite 미들웨어)와 Vercel 배포에서만 동작합니다. `npm run preview`에서는 실시간 모드가 "연결 실패"로 표시됩니다.

## 센서 수신 서버 (로컬 전용)

SQLite(Node 내장 `node:sqlite`, Node 22.13+)에 저장한다. 파일 DB라서 **Vercel에서는 동작하지 않고**(501 응답), 시연 노트북에서 `npm run dev`로 실행한다.

```
POST /api/sensor-data
헤더  x-device-token: <DEVICE_TOKEN>
본문  { "stationId": "st-1", "ts": 1730000000000, "weightG": 599, "rssi": -58, "batteryPct": 91 }
      또는 위 객체의 배열 (재전송용, 최대 500건)
```

- `ts`는 선택 (없으면 서버 수신 시각). 초 단위도 받음. 1분 넘게 미래이거나 하루보다 오래되면 수신 시각으로 대체
- 단위는 g. `weightG`는 로드셀 2개를 합친 총 중량. 센서 이상은 음수 또는 `null`로 보내면 판정에서 "점검 필요"로 처리 (서버는 거절하지 않고 저장)
- 강우는 센서가 보내지 않음 → 서버가 수신 시점의 기상청 값을 붙여 저장
- 같은 지점·시각·값의 재전송은 중복으로 무시
- 조회: `GET /api/stations` (지점 목록), `GET /api/stations?id=st-1&since=<ms>` 또는 `&afterId=<n>`

## 시리얼 브리지 (아두이노 USB 연결)

지금 하드웨어는 로드셀 2개 → HX711 하나 → Arduino Uno → **USB로 노트북**에 연결되고, 시리얼 모니터에 총 중량 값 하나가 찍힌다.
`npm run serial`이 그 값을 읽어 수신 API로 보낸다. 대시보드와 **같은 노트북**에서 실행한다 (와이파이·토큰 전달 불필요).

처음 한 번: `npm install` (시리얼 통신 패키지 `serialport` 설치)

1. 아두이노 IDE의 **시리얼 모니터를 닫는다** (켜져 있으면 포트를 쓸 수 없음)
2. 터미널 1: `npm run dev`, 브라우저에서 상단바 **실시간** 모드
3. 터미널 2: 포트 확인 후 실행

```bash
npm run serial -- --list
```

```bash
npm run serial -- --port COM5 --baud 9600 --tare auto
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--port` | 자동 | 아두이노 포트 (Windows는 `COM3`처럼). 자동 찾기가 안 되면 `--list`로 확인 |
| `--baud` | 9600 | 보드레이트. 아두이노 코드의 `Serial.begin(…)` 값과 같아야 함 (다르면 글자가 깨짐) |
| `--tare` | 0 | 영점(g). `auto`면 시작 후 10개 값의 중앙값 — **거름망을 비운 상태로 시작**. 화면에 나온 값을 다음부터 `--tare 350`처럼 재사용 |
| `--scale` | 1 | 단위 배율. 아두이노가 kg로 찍으면 `1000` |
| `--neg-tol` | 150 | 영점 근처 잡음으로 생긴 작은 음수(이 값 미만)는 0으로 보냄. 판정은 음수를 센서 이상으로 보기 때문 |
| `--station` | st-1 | 보낼 지점 ID |
| `--stdin` | — | 하드웨어 없이 시험: 키보드로 한 줄씩 입력 (`Weight: 599.5 g` 등) |

- 줄 해석: 한 줄에서 **첫 번째 숫자**를 무게로 쓴다 (`599.5`, `Weight: 599.5 g` 모두 가능, `HX711` 같은 글자에 붙은 숫자는 무시). `error`·`fail`·`오류` 같은 문구는 센서 이상(null)으로 보낸다 (`lib/serial.js`)
- 1초마다 모아서 보내고, 서버가 꺼져 있으면 쌓아 뒀다가 다시 보낸다
- 하드웨어 출력 형식(보드레이트, 한 줄 모양, 단위, 영점 여부)은 합동 테스트 때 확인해서 위 옵션으로 맞춘다

**와이파이로 직접 보낼 때 (향후 ESP32)**
1. `npm run dev:host`로 실행 → 터미널에 표시되는 `Network: http://<노트북IP>:5173` 주소와 `DEVICE_TOKEN`을 하드웨어팀에 전달
2. 노트북과 센서가 같은 와이파이(또는 노트북 핫스팟)에 있어야 함. Windows 방화벽에서 Node.js 접근 허용
3. 상단바에서 **실시간** 모드로 전환

테스트 데이터(`npm run fake-sensor`, `npm run serial -- --stdin`)는 같은 DB에 쌓이므로, 발표·합동 테스트 전에 `npm run db:reset -- --yes`로 비울 것

## 페이지

| 주소 | 내용 |
|---|---|
| `#/` 대시보드 | 한 줄 위험 알림(지점 칩을 누르면 상세), 상태 요약(실물/가상 선택, 상태 칸을 누르면 그 상태만 보기), 수거 우선순위 / 알림 기록 탭, 회색조 지도. 지점을 누르면 지도 오른쪽에 요약 카드(중량·점수·강우·마지막 수신), "상세 보기"로 상세 페이지 |
| `#/station/<id>` 지점 상세 | 로드셀 게이지, 판정 근거, 통신 상태, 중량 그래프, 상태 전환 기록 (요약 카드의 상세 보기·알림의 지점 보기로 이동) |
| `#/route` 수거 경로 | 큰 지도 위 경로와 방문 순서 |
| `#/compare` 판정 비교 | 같은 센서 데이터를 단순 임계값 vs 우리 방식으로 판정 — 그래프 + 정답·단순·우리 상태 띠, 시나리오 8종 정확도·오경보 표 (`npm run scenario`와 같은 계산) |

실물 지점은 유선 연결·외부 전원이라 상세의 통신 상태에 신호 세기·배터리를 표시하지 않는다.

## 수거 경로

상단의 **수거 경로** 페이지에서 위험(또는 위험+주의) 지점을 출발지에서 도는 가장 빠른 순서와 도로 경로를 지도에 그린다. 총 거리·이동 시간·방문 순서를 함께 표시한다.

- 계산: `POST /api/route` → 공개 OSRM 서버(오픈스트리트맵 도로, 키 불필요)의 순회 경로 최적화(trip)
- 대체 순서: OSRM 실패 시 ① 저장된 같은 경로(`data/route-cache.json`) ② 직선 추정(가까운 지점부터, 점선 표시)
- 공개 OSRM 서버는 시험용이라 느리거나 멈출 수 있다. **발표 전에 인터넷이 되는 곳에서 같은 흐름(처음부터 → 재생)으로 경로를 한 번 띄워 두면** 저장분이 쌓여 당일 인터넷이 끊겨도 도로 경로가 나온다
- 출발지 좌표는 `src/config.js`의 `DEPOT`, 지점 좌표는 `src/sim/simulator.js`의 `DEFAULT_STATIONS` (충북대 주변 임시 좌표 25곳 — 실물 1 + 가상 24, 실제 빗물받이 위치 아님)

## 폴더 구조

```
api/            API 핸들러 (weather: 기상청 프록시, sensor-data: 센서 수신, stations: 이력 조회, route: 수거 경로)
server/         SQLite 저장소(db.js)·수신 검증(ingest.js)·공통 도우미(http.js)
data/           SQLite 파일 (git 제외)
lib/            기상청 API 호출·파싱·위경도→격자 변환 (kma.js), 수거 경로 계산 (route.js), 시리얼 줄 해석·영점 (serial.js)
scripts/        시나리오 출력, 센서 흉내, 시리얼 브리지 등 보조 스크립트
public/         정적 파일
src/
  components/   화면 컴포넌트 (TopBar, ScenarioControls, Summary, PriorityList, MapView, DrainDetail, LoadCellGauge, WeightChart, CommStatus, Timeline, Toasts, StateBadge)
  ui/           화면 표시용 순수 함수·차트 색 (format.js, colors.js)
  logic/        상태 정의·판정 로직·데이터 계약 (states.js, judge.js, evaluate.js, types.js)
  sim/          가상 데이터 생성기·엔진·화면용 훅 (scenario.js, simulator.js, engine.js, useSimulation.js)
  config.js     지점·임계값 설정
  App.jsx, main.jsx, styles.css
```

## 구현 현황

- [x] 개발 환경 세팅 (빌드·테스트 동작 확인)
- [x] 상태 정의·임계값 설정, 데이터 계약 (`states.js`, `config.js`, `types.js`)
- [x] 가상 데이터 생성기·시나리오 8종 (`src/sim/`)
- [x] 판정 로직 + 테스트, 단순 임계값 방식과 성능 비교 (`src/logic/judge.js`, `evaluate.js`)
- [x] 시뮬레이션 훅 `useSimulation` (`src/sim/engine.js`, `useSimulation.js`)
- [x] 대시보드 화면 (`docs/DESIGN.md` 기준): 상단바·시연 제어, 상태 요약, 수거 우선순위, 지도, 상세(로드셀 게이지·중량 그래프·통신 상태·타임라인), 위험 배너·토스트
- [x] 접근성 점검: 상태 글자색 대비 4.5:1 이상, 키보드 조작, 동작 줄이기 대응
- [x] 기상청 API 연동: 초단기실황 프록시 + 강우 모드(시뮬레이션/실시간) (`lib/kma.js`, `api/weather.js`, `src/sim/useWeather.js`)
- [x] 센서 수신 서버·DB: 수신 API + SQLite + 이력 조회, 실시간 모드에서 실물 지점 연동, 센서 흉내 스크립트
- [x] 임계값 하드웨어 기준 적용 (주의 250 / 2단계 500 / 위험 1000g), 30초 이동 중앙값, 1초 간격 대응 (`docs/기획서.md` 4.8·4.9)
- [x] 총 중량 1채널로 변경 (로드셀 2개 → HX711 하나, `weightG`), 편측 기준·편중 삭제 (`docs/기획서.md` v3.3)
- [ ] 센서 정격·기준값 반영 (하드웨어팀 전달 예정)
- [x] 지점 25곳(충북대 주변 임시 좌표) + 수거 경로(OSRM, 저장분·직선 대체) (`lib/route.js`, `api/route.js`, `RoutePanel`)
- [x] 상습 주의 구간: 최근 30일 수거 14회 이상인 지점 (목록 "상습", 지도 점선 테두리, 요약 카드·상세 30일 막대). 가상 지점은 시나리오·비 노출 정도로 만든 **가상 기록**, 실물 지점은 합동 테스트부터 기록 (`src/sim/history.js`, `config.js` `HOTSPOT`)
- [x] 시뮬레이션에서 날씨 비가 오면 비의 양 × 지점별 노출 정도(0.6~1.4)만큼 더 빨리 쌓임, 거름망 가득(1,800g)에서 멈춤 — 맑음 / 비 예보(보통 비 5mm/h) / 호우특보(30mm/h)가 화면에서 구분됨
- [x] 페이지 분할(대시보드·지점 상세·수거 경로), 상태·실물/가상 필터, 실물 지점 신호·배터리 숨김 (`src/ui/router.js`)
- [x] USB 시리얼 브리지 (`npm run serial`, `scripts/serial-bridge.js`, `lib/serial.js`) — 출력 형식은 가정(한 줄에 숫자), 합동 테스트 때 옵션으로 맞춤
- [x] 영점 빼기 (`--tare auto` / `--tare <g>`, 브리지에서 처리) — 하드웨어가 영점을 맞춰 보내면 `--tare 0`
- [ ] 판정 결과 서버 저장·일자별 통계 (후속)

## 배포

Vercel에 GitHub 레포를 연결하고 환경변수 `KMA_SERVICE_KEY`를 설정합니다. 리전은 `vercel.json`에서 `icn1`(서울)로 지정되어 있습니다.

## 문서

- [기획서](docs/기획서.md) — 기획 근거(개발계획서 → 멘토링 보고서 순)와 설계 결정, 판정 규칙, 임계값 (현재 v3.3)
- [디자인 가이드](docs/DESIGN.md) — 색·간격·컴포넌트 규칙 (총 중량 게이지 기준)
