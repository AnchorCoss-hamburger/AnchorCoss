// 시리얼 브리지: 아두이노(HX711)가 USB 시리얼로 찍는 무게 → 수신 API(POST /api/sensor-data)
// 대시보드(npm run dev)와 같은 노트북에서 실행한다. 판정·화면은 기존 실시간 모드가 그대로 처리한다.
//
// 사용 (npm run dev 를 켠 상태에서 다른 터미널)
//   npm run serial -- --list                      포트 목록 (아두이노가 어느 COM인지 확인)
//   npm run serial                                아두이노 포트 자동 찾기, 9600bps
//   npm run serial -- --port COM5 --baud 57600    포트·보드레이트 지정
//   npm run serial -- --tare auto                 시작 후 10개 값의 중앙값을 영점으로 (거름망을 비운 상태로 시작)
//   npm run serial -- --tare 350                  영점 고정값 (g) — auto로 잰 값을 다음부터 이렇게 재사용
//   npm run serial -- --scale 1000                아두이노가 kg로 찍는 경우
//   npm run serial -- --stdin                     하드웨어 없이 시험: 키보드(또는 파일)로 한 줄씩 입력
//
// 주의
//  - 아두이노 IDE의 시리얼 모니터가 켜져 있으면 포트를 쓸 수 없다 (먼저 닫을 것)
//  - 줄 해석: 첫 번째 숫자를 무게로 쓴다 ("Weight: 599.5 g" → 599.5). 오류 문구는 센서 이상(null)으로 보낸다 (lib/serial.js)
//  - 빈 상태 잡음으로 생기는 작은 음수(-150g 초과)는 0으로 보낸다. 판정은 음수를 센서 이상으로 보기 때문
//  - 서버가 꺼져 있거나 실패하면 모아 뒀다가 다시 보낸다 (최대 3600건)

import { createInterface } from "node:readline";
import { readEnv } from "./_env.js";
import { parseWeightLine, applyTare, createAutoTare, pickArduinoPort } from "../lib/serial.js";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const station = arg("station", "st-1");
const base = String(arg("url", "http://localhost:5173")).replace(/\/$/, "");
const baudRate = Number(arg("baud", 9600));
const scale = Number(arg("scale", 1));
const negTolG = Number(arg("neg-tol", 150));
const sendEverySec = Number(arg("interval", 1));
const tareArg = arg("tare", "0");
const autoTareN = Number(arg("tare-samples", 10));
const useStdin = arg("stdin", false) === true;
const QUEUE_MAX = 3600;
const BATCH_MAX = 500; // 서버 한 번 최대 건수 (server/ingest.js MAX_BATCH)

async function loadSerialport() {
  try {
    return await import("serialport");
  } catch {
    console.error("serialport 패키지가 없습니다. 프로젝트 폴더에서 npm install 을 먼저 실행하세요.");
    process.exit(1);
  }
}

// --list: 포트 목록만 보여 주고 끝
if (arg("list", false) === true) {
  const { SerialPort } = await loadSerialport();
  const ports = await SerialPort.list().catch((e) => {
    console.error("포트 목록을 읽지 못했습니다:", e.message);
    return [];
  });
  if (!ports.length) console.log("연결된 시리얼 포트가 없습니다 (아두이노 USB 연결 확인).");
  for (const p of ports) console.log(`${p.path}\t${p.manufacturer ?? ""} ${p.friendlyName ?? ""}`.trim());
  const guess = pickArduinoPort(ports);
  if (guess) console.log(`\n→ 아두이노로 보이는 포트: ${guess}`);
  process.exit(0);
}

const token = readEnv("DEVICE_TOKEN");
if (!token) {
  console.error("DEVICE_TOKEN이 없습니다. .env.local에 DEVICE_TOKEN=... 을 넣으세요 (.env.example 참고).");
  process.exit(1);
}

// ---------- 영점 ----------
const autoTare = tareArg === "auto" ? createAutoTare(autoTareN) : null;
let tareG = autoTare ? null : Number(tareArg);
if (!autoTare && !Number.isFinite(tareG)) {
  console.error(`--tare 값이 숫자가 아닙니다: ${tareArg} (예: --tare 350 또는 --tare auto)`);
  process.exit(1);
}

// ---------- 전송 ----------
let queue = [];
let sent = 0;
let lastShown = null;

async function flush() {
  if (!queue.length) return;
  const batch = queue.slice(0, BATCH_MAX);
  try {
    const r = await fetch(`${base}/api/sensor-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-token": token },
      body: JSON.stringify(batch),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 400) {
      // 형식 오류는 다시 보내도 같은 결과 → 버리고 다음으로
      queue = queue.slice(batch.length);
      console.log(`형식 오류로 ${batch.length}건 버림: ${j.rejected?.[0]?.error ?? j.error ?? ""}`);
      return;
    }
    if (r.status === 401) throw new Error("토큰 불일치 — .env.local의 DEVICE_TOKEN과 서버 설정이 같은지 확인");
    if (!r.ok) throw new Error(`${r.status} ${j.error ?? ""}`.trim());
    queue = queue.slice(batch.length);
    sent += j.accepted ?? 0;
    const last = batch[batch.length - 1];
    const w = last.weightG == null ? "센서 이상" : `${last.weightG}g`;
    if (j.rejected?.length) console.log(`  거절 ${j.rejected.length}건: ${j.rejected[0].error}`);
    console.log(`전송 ${batch.length}건 (누적 ${sent}) · 최근 ${w}${lastShown != null ? ` (원시 ${lastShown}g)` : ""}`);
  } catch (e) {
    const refused = e.cause?.code === "ECONNREFUSED";
    console.log(`전송 실패 — ${refused ? "서버가 꺼져 있습니다 (npm run dev 확인)" : e.message} · 대기 ${queue.length}건, 다시 시도합니다`);
  }
}

function enqueue(weightG) {
  queue.push({ stationId: station, ts: Date.now(), weightG });
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
}

/** 시리얼 한 줄 처리 */
function onLine(line) {
  const p = parseWeightLine(line, { scale });
  if (p.kind === "skip") {
    if (String(line).trim()) console.log(`  (무시) ${String(line).trim()}`);
    return;
  }
  if (p.kind === "fault") {
    console.log(`  센서 오류 문구: ${String(line).trim()} → 센서 이상으로 전송`);
    lastShown = null; // 전송 로그에 직전 줄의 원시값이 남지 않게
    enqueue(null);
    return;
  }
  lastShown = p.weightG;
  if (autoTare && autoTare.value == null) {
    const t = autoTare.push(p.weightG);
    if (t == null) {
      console.log(`영점 측정 중… ${autoTare.collected}/${autoTareN} (거름망을 비운 상태로 두세요)`);
      return;
    }
    tareG = t;
    console.log(`영점 = ${tareG}g — 다음부터 같은 상태라면 --tare ${tareG} 로 바로 시작할 수 있습니다`);
    return;
  }
  enqueue(applyTare(p.weightG, { tareG, negTolG }));
}

// ---------- 입력: 시리얼 또는 표준 입력 ----------
console.log(`▶ ${base}/api/sensor-data  지점=${station}  영점=${autoTare ? `자동(${autoTareN}개)` : `${tareG}g`}  배율=${scale}`);

if (useStdin) {
  console.log("표준 입력 모드: 한 줄씩 입력하세요 (예: 599.5 또는 Weight: 599.5 g). 끝내려면 Ctrl+C");
  createInterface({ input: process.stdin }).on("line", onLine).on("close", async () => {
    await flush();
    process.exit(0);
  });
} else {
  const { SerialPort, ReadlineParser } = await loadSerialport();
  let path = arg("port", null);
  if (path === true) path = null;
  if (!path) {
    const ports = await SerialPort.list().catch(() => []);
    path = pickArduinoPort(ports) ?? (ports.length === 1 ? ports[0].path : null);
    if (!path) {
      console.error("아두이노 포트를 찾지 못했습니다. npm run serial -- --list 로 확인한 뒤 --port COM5 처럼 지정하세요.");
      process.exit(1);
    }
  }
  const port = new SerialPort({ path, baudRate }, (err) => {
    if (!err) return;
    const busy = /access denied|busy|resource/i.test(err.message);
    console.error(`포트 ${path}을(를) 열 수 없습니다: ${err.message}`);
    if (busy) console.error("→ 아두이노 IDE의 시리얼 모니터 등 다른 프로그램이 포트를 쓰고 있는지 확인하세요.");
    process.exit(1);
  });
  console.log(`포트 ${path} · ${baudRate}bps 연결 중… (글자가 깨지면 --baud 값을 아두이노 코드와 맞추세요)`);
  port.pipe(new ReadlineParser({ delimiter: "\n" })).on("data", onLine);
  port.on("close", () => {
    console.error("포트 연결이 끊겼습니다 (USB 케이블 확인). 다시 실행하세요.");
    process.exit(1);
  });
}

setInterval(flush, sendEverySec * 1000);
process.on("SIGINT", async () => {
  await flush();
  process.exit(0);
});
