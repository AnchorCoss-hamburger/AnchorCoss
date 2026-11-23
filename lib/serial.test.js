import { describe, it, expect } from "vitest";
import { parseWeightLine, applyTare, createAutoTare, pickArduinoPort } from "./serial.js";

describe("parseWeightLine", () => {
  it("숫자만 / 글자가 붙은 줄", () => {
    expect(parseWeightLine("599.5")).toEqual({ kind: "value", weightG: 599.5 });
    expect(parseWeightLine("Weight: 599.5 g\r")).toEqual({ kind: "value", weightG: 599.5 });
    expect(parseWeightLine("무게 : -12.3g")).toEqual({ kind: "value", weightG: -12.3 });
    expect(parseWeightLine("1200")).toEqual({ kind: "value", weightG: 1200 });
  });
  it("숫자가 없는 줄은 무시, 오류 문구는 센서 이상", () => {
    expect(parseWeightLine("")).toEqual({ kind: "skip" });
    expect(parseWeightLine("HX711 ready")).toEqual({ kind: "skip" });
    expect(parseWeightLine("HX711 ok, weight 12.5")).toEqual({ kind: "value", weightG: 12.5 });
    expect(parseWeightLine("ERROR: HX711 not found")).toEqual({ kind: "fault", weightG: null });
    expect(parseWeightLine("측정 실패")).toEqual({ kind: "fault", weightG: null });
  });
  it("단위 변환 (kg로 찍히는 경우)", () => {
    expect(parseWeightLine("0.6 kg", { scale: 1000 })).toEqual({ kind: "value", weightG: 600 });
  });
});

describe("applyTare", () => {
  it("영점을 빼고 반올림", () => {
    expect(applyTare(950.04, { tareG: 350 })).toBe(600);
  });
  it("0 근처 작은 음수는 0, 크게 음수면 그대로 (센서 이상)", () => {
    expect(applyTare(320, { tareG: 350 })).toBe(0); // -30 → 0
    expect(applyTare(-80)).toBe(0);
    expect(applyTare(-400)).toBe(-400);
    expect(applyTare(-100, { negTolG: 50 })).toBe(-100);
  });
});

describe("createAutoTare", () => {
  it("처음 n개 값의 중앙값 (튀는 값에 덜 흔들림)", () => {
    const t = createAutoTare(5);
    expect([340, 360, 350, 900, 345].map((v) => t.push(v))).toEqual([null, null, null, null, 350]);
    expect(t.push(1000)).toBe(350); // 정해진 뒤에는 그대로
    expect(t.value).toBe(350);
  });
});

describe("pickArduinoPort", () => {
  it("아두이노로 보이는 포트를 고른다", () => {
    const ports = [
      { path: "COM1", manufacturer: "(표준 포트 유형)" },
      { path: "COM5", manufacturer: "wch.cn", friendlyName: "USB-SERIAL CH340 (COM5)" },
    ];
    expect(pickArduinoPort(ports)).toBe("COM5");
    expect(pickArduinoPort([{ path: "COM3", manufacturer: "Arduino LLC (www.arduino.cc)" }])).toBe("COM3");
    expect(pickArduinoPort([{ path: "COM1" }])).toBeNull();
  });
});
