// 중량 그래프 (DESIGN.md 5장): 총 중량 선, 1·2·3단계(주의·중간·위험) 점선, 우천 구간 배경, 상태 전환 세로선
// forecast가 있으면 지금 속도로 이어지는 예측 점선과 수거 기준 도달 예상 시각을 오른쪽에 그린다 (format.js forecastLine)
// 실물 센서는 1초 간격이라 1시간이 3600점 → 그래프에는 최대 MAX_POINTS개로 줄여 그린다 (구간 평균)

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { TH } from "../config.js";
import { COLORS } from "../ui/colors.js";
import { toChartData, downsample, rainSegments, timeTicks, fmtTick, fmtHM, fmtTime, fmtG } from "../ui/format.js";

const NAMES = { total: "총 중량", forecast: "예측 (현재 속도 기준)" };
const MAX_POINTS = 400;

export function WeightChart({ history, transitions, forecast = null }) {
  const base = downsample(toChartData(history, { maxG: TH.MAX_VALID_G }), MAX_POINTS);
  if (base.length < 2) return <p className="muted chart-empty">데이터 수집 중…</p>;

  // 예측선: 마지막 점에서 시작해 앞으로 이어지는 점 하나를 덧붙인다
  const data = forecast
    ? [...base.slice(0, -1), { ...base[base.length - 1], forecast: forecast.fromG }, { ts: forecast.toTs, total: null, forecast: forecast.toG }]
    : base;
  const from = data[0].ts;
  const to = data[data.length - 1].ts;
  const lastTs = base[base.length - 1].ts;
  const maxTotal = Math.max(0, ...data.map((d) => Math.max(d.total ?? 0, d.forecast ?? 0)));
  const yMax = Math.ceil(Math.max(TH.DANGER_TOTAL_G * 1.2, maxTotal * 1.1) / 100) * 100;
  const rain = rainSegments(data, TH.RAIN_MM_H);
  const marks = transitions.filter((t) => t.ts >= from && t.ts <= lastTs);
  const { ticks, stepMs } = timeTicks(from, to); // 시간축: 분·초 경계에 맞춘 눈금 (중복 라벨 방지)

  return (
    <div className="chart">
      {/* 높이는 CSS(.chart-box)가 정한다 — 낮은 화면에서는 줄임 */}
      <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />
          {rain.map((seg) => (
            <ReferenceArea key={seg.from} x1={seg.from} x2={seg.to} fill={COLORS.rain} fillOpacity={0.7} ifOverflow="hidden" />
          ))}
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[from, to]}
            ticks={ticks}
            tickFormatter={(v) => fmtTick(v, stepMs)}
            stroke={COLORS.axis}
            fontSize={12}
          />
          <YAxis domain={[0, yMax]} stroke={COLORS.axis} fontSize={12} width={52} tickFormatter={(v) => `${v}g`} />
          <ReferenceLine y={TH.WARN_TOTAL_G} stroke={COLORS.warn} strokeDasharray="5 4" label={{ value: "1단계·주의", position: "insideTopLeft", fill: COLORS.warnText, fontSize: 11 }} />
          <ReferenceLine y={TH.MID_TOTAL_G} stroke={COLORS.axis} strokeDasharray="2 4" label={{ value: "2단계", position: "insideTopLeft", fill: COLORS.axis, fontSize: 11 }} />
          <ReferenceLine y={TH.DANGER_TOTAL_G} stroke={COLORS.danger} strokeDasharray="5 4" label={{ value: "3단계·위험(수거)", position: "insideTopLeft", fill: COLORS.dangerText, fontSize: 11 }} />
          {marks.map((m) => (
            <ReferenceLine key={m.id} x={m.ts} stroke={COLORS[m.to]} strokeOpacity={0.6} />
          ))}
          <Tooltip
            labelFormatter={(ts) => fmtTime(ts)}
            formatter={(v, key) => [fmtG(v), NAMES[key] ?? key]}
            isAnimationActive={false}
          />
          <Line type="monotone" dataKey="total" stroke={COLORS.total} dot={false} strokeWidth={2.5} isAnimationActive={false} />
          {forecast && (
            <Line type="linear" dataKey="forecast" stroke={COLORS.total} strokeDasharray="6 5" strokeOpacity={0.55} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
          )}
          {forecast?.crossTs && (
            <ReferenceLine x={forecast.crossTs} stroke={COLORS.danger} strokeDasharray="3 3" label={{ value: `도달 예상 ${fmtHM(forecast.crossTs)}`, position: "insideTopRight", fill: COLORS.dangerText, fontSize: 11 }} />
          )}
        </LineChart>
      </ResponsiveContainer>
      </div>
      <ul className="chart-legend">
        <li><span className="swatch is-thick" style={{ background: COLORS.total }} />총 중량</li>
        {forecast && <li><span className="swatch is-dashed" />예측 (현재 속도 기준)</li>}
        <li><span className="swatch is-area" style={{ background: COLORS.rain }} />우천 구간</li>
        <li><span className="swatch is-vline" />상태 전환 시점</li>
      </ul>
    </div>
  );
}
