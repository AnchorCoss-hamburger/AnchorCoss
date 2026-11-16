// 시리얼 브리지의 줄 해석·영점 처리 (순수 함수, scripts/serial-bridge.js가 사용)
//
// 아두이노(HX711)가 시리얼로 찍는 한 줄 → 총 중량(g)
//   "599.5"            → 599.5
//   "Weight: 599.5 g"  → 599.5   (글자가 붙어 있어도 첫 번째 숫자를 쓴다)
//   "HX711 ready"      → 무시 (숫자 없음)
//   "ERROR: HX711 not found" → 센서 이상 (weightG: null)
// 정확한 출력 형식은 하드웨어팀 확인 후 맞춘다 (README "시리얼 브리지").

// 글자·숫자에 붙은 숫자는 제외 ("HX711"의 711을 무게로 읽지 않게)
const NUMBER = /(?<![A-Za-z\d.])[-+]?\d+(?:\.\d+)?/;
const FAULT = /error|fail|not\s*found|timeout|오류|실패/i;

/**
 * @param {string} line 시리얼 한 줄
 * @param {{ scale?: number }} [opt] scale: 단위 변환 배율 (kg로 찍히면 1000)
 * @returns {{ kind: "value", weightG: number } | { kind: "fault", weightG: null } | { kind: "skip" }}
 */
export function parseWeightLine(line, { scale = 1 } = {}) {
  const text = String(line ?? "").trim();
  if (!text) return { kind: "skip" };
  if (FAULT.test(text)) return { kind: "fault", weightG: null };
  const m = text.match(NUMBER);
  if (!m) return { kind: "skip" };
  return { kind: "value", weightG: Number(m[0]) * scale };
}

/**
 * 영점 빼기 + 0 근처 작은 음수 정리.
 * 빈 상태에서도 잡음(±100g) 때문에 -30g 같은 값이 나오는데, 판정은 음수를 "센서 이상"으로 본다.
 * 그래서 -negTolG < 값 < 0 은 0으로 바꾸고, 그보다 크게 음수면(센서 이상) 그대로 둔다.
 * @param {number} rawG 센서 값 (영점 전)
 * @param {{ tareG?: number, negTolG?: number }} [opt]
 * @returns {number} 소수 첫째 자리로 반올림한 값
 */
export function applyTare(rawG, { tareG = 0, negTolG = 150 } = {}) {
  const v = rawG - tareG;
  const out = v < 0 && v > -negTolG ? 0 : v;
  return Math.round(out * 10) / 10;
}

/**
 * 자동 영점: 시작 후 처음 n개 값의 중앙값을 영점으로 쓴다 (거름망이 빈 상태에서 시작할 것).
 * push(값)는 영점이 정해지기 전에는 null, 정해진 뒤에는 영점 값을 돌려준다.
 */
export function createAutoTare(n = 10) {
  const vals = [];
  let tare = null;
  return {
    push(v) {
      if (tare != null) return tare;
      vals.push(v);
      if (vals.length >= n) {
        const s = [...vals].sort((a, b) => a - b);
        const mid = s.length >> 1;
        tare = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        tare = Math.round(tare * 10) / 10;
      }
      return tare;
    },
    get value() {
      return tare;
    },
    get collected() {
      return vals.length;
    },
  };
}

/**
 * 아두이노로 보이는 포트를 고른다 (serialport의 list() 결과).
 * 제조사·이름에 Arduino/CH340/USB Serial 등이 들어 있으면 우선, 없으면 null.
 */
export function pickArduinoPort(ports) {
  const hint = /arduino|ch340|ch341|wch|usb.?serial|ftdi|cp210|silicon labs/i;
  const hit = ports.find((p) => hint.test(`${p.manufacturer ?? ""} ${p.friendlyName ?? ""} ${p.pnpId ?? ""}`));
  return hit?.path ?? null;
}
