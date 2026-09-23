import { useMemo, useState, type ChangeEvent } from "react";
import type { Carpet, ScheduleEntry } from "../business/types";
import {
  BatchDraft,
  BatchResult,
  POOLS,
  parseTime,
} from "../business/schedulingRules";
import { poolDayUsage } from "../business/filtering";
import { formatDuration, minutesToHM, todayISO } from "../business/format";

interface Props {
  archives: Carpet[];
  entries: ScheduleEntry[];
  onCommit: (drafts: BatchDraft[]) => BatchResult;
}

function blankDraft(seq: number, archives: Carpet[]): BatchDraft {
  const pool = POOLS[seq % POOLS.length];
  const start = 8 * 60 + seq * 60;
  return {
    carpetId: archives[Math.min(seq, archives.length - 1)]?.id ?? "",
    poolId: pool.id,
    date: todayISO(),
    startTime: minutesToHM(start),
    durationText: "90",
  };
}

export default function BatchPanel({ archives, entries, onCommit }: Props) {
  const [drafts, setDrafts] = useState<BatchDraft[]>(() => [
    blankDraft(0, archives),
    blankDraft(1, archives),
  ]);
  const [result, setResult] = useState<BatchResult | null>(null);

  const previewDate = drafts[0]?.date || todayISO();

  // 各池当日余量提示（按第一行的日期展示，帮助排期人避开容量上限）
  const usage = useMemo(
    () =>
      POOLS.map((p) => ({
        pool: p,
        used: poolDayUsage(entries, p.id, previewDate),
      })),
    [entries, previewDate],
  );

  function patch(row: number, patch: Partial<BatchDraft>) {
    setDrafts((list) => list.map((d, i) => (i === row ? { ...d, ...patch } : d)));
    setResult(null);
  }

  function commit() {
    const r = onCommit(drafts);
    setResult(r);
  }

  function resetRows() {
    setDrafts([blankDraft(0, archives), blankDraft(1, archives)]);
    setResult(null);
  }

  if (archives.length === 0) {
    return (
      <section className="panel">
        <div className="heading">
          <div>
            <p>批量排期</p>
            <h2>清洗池排期</h2>
          </div>
        </div>
        <p className="banner error">请先在左侧登记地毯档案，再做排期。</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>批量排期 · 整批成功或整批退回</p>
          <h2>清洗池排期</h2>
        </div>
        <div className="head-actions">
          <button type="button" onClick={() => setDrafts((l) => [...l, blankDraft(l.length, archives)])}>
            + 加一行
          </button>
          <button type="button" onClick={resetRows}>
            清空重填
          </button>
          <button type="button" className="primary" onClick={commit}>
            提交整批排期
          </button>
        </div>
      </div>

      <div className="pool-usage">
        {usage.map(({ pool, used }) => {
          const ratio = Math.min(1, used / pool.dailyCapacityMinutes);
          return (
            <div key={pool.id} className="usage-cell">
              <div className="usage-head">
                <span>{pool.name}</span>
                <span className={used >= pool.dailyCapacityMinutes ? "danger-text" : ""}>
                  {used} / {pool.dailyCapacityMinutes} 分钟
                </span>
              </div>
              <div className="bar">
                <i style={{ width: `${ratio * 100}%` }} />
              </div>
              <small>{previewDate} 剩余 {Math.max(0, pool.dailyCapacityMinutes - used)} 分钟</small>
            </div>
          );
        })}
      </div>

      <div className="batch-list">
        <div className="batch-row batch-head">
          <span>#</span><span>地毯编号</span><span>清洗池</span><span>日期</span>
          <span>开始</span><span>预计时长(分)</span><span>预计时段</span><span />
        </div>
        {drafts.map((d, i) => {
          const start = parseTime(d.startTime);
          const dur = Number(d.durationText);
          const end =
            !Number.isNaN(start) && Number.isFinite(dur) && dur > 0
              ? `${minutesToHM(start)}–${minutesToHM(start + dur)}`
              : "—";
          return (
            <div className="batch-row" key={i}>
              <b>{i + 1}</b>
              <select value={d.carpetId} onChange={(e: ChangeEvent<HTMLSelectElement>) => patch(i, { carpetId: e.target.value })}>
                <option value="">选择地毯…</option>
                {archives.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}（{c.origin}）
                  </option>
                ))}
              </select>
              <select value={d.poolId} onChange={(e: ChangeEvent<HTMLSelectElement>) => patch(i, { poolId: e.target.value })}>
                {POOLS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{formatDuration(p.dailyCapacityMinutes)}/日）
                  </option>
                ))}
              </select>
              <input type="date" value={d.date} onChange={(e: ChangeEvent<HTMLInputElement>) => patch(i, { date: e.target.value })} />
              <input
                type="time"
                value={d.startTime}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch(i, { startTime: e.target.value })}
              />
              <input
                type="number"
                min={1}
                step={1}
                value={d.durationText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch(i, { durationText: e.target.value })}
              />
              <span className="slot-preview">{end}</span>
              <button
                type="button"
                className="ghost"
                disabled={drafts.length === 1}
                onClick={() => setDrafts((l) => l.filter((_, j) => j !== i))}
              >
                移除
              </button>
            </div>
          );
        })}
      </div>

      {result && !result.ok && (
        <div className="banner error">
          <strong>整批退回，已有池排期与档案均未改动：</strong>
          <ul>
            {result.violations.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
        </div>
      )}
      {result?.ok && (
        <p className="banner success">
          整批 {drafts.length} 条排期已成功排入对应清洗池。
        </p>
      )}

      <p className="rule-note">
        规则：同一清洗池同一时段只接待一条地毯，首尾相接（压边）也判冲突；每池当日累计时长不得超过容量；
        任一行触雷，整批退回。
      </p>
    </section>
  );
}
