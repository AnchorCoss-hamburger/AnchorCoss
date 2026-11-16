import { useState } from "react";
import { STATES, STATE_META, FLAGS } from "../logic/states.js";
import { sortByPriority, fmtTime } from "../ui/format.js";
import { collectionHistory } from "../sim/history.js";
import { HOTSPOT } from "../config.js";

// 목록 안에서는 짧은 상태 이름 (긴 이름은 상세·요약 카드에서)
const SHORT = { normal: "정상", warn: "주의", danger: "위험", check: "점검" };

function MiniBadge({ state }) {
  return (
    <span className={`badge badge-mini st-${state}`}>
      <span className="badge-icon" aria-hidden="true">
        {STATE_META[state]?.icon}
      </span>
      {SHORT[state]}
    </span>
  );
}

/**
 * 메인 왼쪽 목록 카드: 탭 두 개
 * - 수거 우선순위 (DESIGN.md 5장 PriorityList): 한 줄 = 순위 · 지점명 · 상태 · 점수 막대
 * - 알림 기록: 최근 상태 전환 (최신순) = 시각 · 지점 · 이전 → 이후 · 사유
 * 어느 행이든 누르면 그 지점을 선택한다 (지도 위 요약 카드).
 */
export function PriorityList({ stations, events = [], selectedId, onSelect }) {
  const [tab, setTab] = useState("prio");
  const sorted = sortByPriority(stations);
  // 필터(실물/가상·상태)로 보이는 지점의 기록만
  const visible = new Map(stations.map((s) => [s.id, s.name]));
  const log = events.filter((e) => visible.has(e.stationId));

  return (
    <section className="card prio-card" aria-label="수거 우선순위와 알림 기록">
      <div className="list-tabs" role="tablist" aria-label="목록 종류">
        <button
          role="tab"
          aria-selected={tab === "prio"}
          className={`list-tab${tab === "prio" ? " is-active" : ""}`}
          onClick={() => setTab("prio")}
        >
          수거 우선순위
        </button>
        <button
          role="tab"
          aria-selected={tab === "log"}
          className={`list-tab${tab === "log" ? " is-active" : ""}`}
          onClick={() => setTab("log")}
        >
          알림 기록 <span className="list-tab-count num">{log.length}</span>
        </button>
      </div>

      {tab === "prio" ? (
        <>
          {sorted.length === 0 && <p className="muted">선택한 조건에 맞는 지점이 없습니다.</p>}
          <ol className="plain-list">
            {sorted.map((s, i) => {
              const j = s.judgement;
              const isCheck = j.state === STATES.CHECK;
              const raining = j.flags.includes(FLAGS.RAINING);
              return (
                <li key={s.id}>
                  <button
                    className={`list-row prio-row${s.id === selectedId ? " is-selected" : ""}`}
                    onClick={() => onSelect(s.id)}
                    aria-pressed={s.id === selectedId}
                  >
                    <span className="prio-rank num">{isCheck ? "–" : i + 1}</span>
                    <span className="prio-name">
                      {s.name.replace("빗물받이 ", "")}
                      {raining && <span className="tag is-rain">우천</span>}
                      {collectionHistory(s)?.hotspot && (
                        <span
                          className="tag is-hot"
                          title={`최근 ${HOTSPOT.DAYS}일 수거 ${collectionHistory(s).total}회 — 상습 주의 구간 (가상 기록)`}
                        >
                          상습
                        </span>
                      )}
                    </span>
                    <MiniBadge state={j.state} />
                    <span className="prio-score">
                      {isCheck ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          <span className={`num tx-${j.state}`}>{j.score}</span>
                          <span className="score-bar" aria-hidden="true">
                            <span className={`score-fill st-${j.state}`} style={{ width: `${j.score}%` }} />
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <>
          {log.length === 0 && <p className="muted">아직 상태가 바뀐 지점이 없습니다.</p>}
          <ol className="plain-list">
            {log.map((e) => (
              <li key={e.id}>
                <button
                  className={`list-row log-row${e.stationId === selectedId ? " is-selected" : ""}`}
                  onClick={() => onSelect(e.stationId)}
                  title={e.reason}
                >
                  <span className="log-time num">{fmtTime(e.ts)}</span>
                  <span className="log-name">{(visible.get(e.stationId) ?? e.stationId).replace("빗물받이 ", "")}</span>
                  <span className="log-change">
                    <span className={`log-dot st-${e.from}`} aria-label={STATE_META[e.from]?.label}>
                      {STATE_META[e.from]?.icon}
                    </span>
                    <span className="muted" aria-hidden="true">
                      →
                    </span>
                    <span className={`log-dot st-${e.to}`} aria-label={STATE_META[e.to]?.label}>
                      {STATE_META[e.to]?.icon}
                    </span>
                    <span className={`log-to tx-${e.to}`}>{SHORT[e.to]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
