import { useMemo } from "react";
import "./styles.css";
import type { EntryStatus, ScheduleEntry } from "./business/types";
import {
  BatchDraft,
  BatchResult,
  evaluateBatch,
} from "./business/schedulingRules";
import { clearStoredState, usePersistentState } from "./business/persistence";
import { buildSeedState } from "./business/seed";
import { uid } from "./business/format";
import ArchivePanel from "./components/ArchivePanel";
import BatchPanel from "./components/BatchPanel";
import ScheduleBoard from "./components/ScheduleBoard";

function App() {
  const [state, setState, reset] = usePersistentState(buildSeedState());
  const { archives, entries, fixLogs } = state;

  const carpetIds = useMemo(() => new Set(archives.map((c) => c.id)), [archives]);
  const busyCarpetIds = useMemo(() => new Set(entries.map((e) => e.carpetId)), [entries]);

  const metrics = useMemo(() => {
    const pending = entries.filter((e) => e.status === "scheduled").length;
    const washing = entries.filter((e) => e.status === "washing" || e.status === "suspended").length;
    const suspended = entries.filter((e) => e.status === "suspended").length;
    const done = entries.filter((e) => e.status === "done").length;
    const rate = entries.length ? Math.round((done / entries.length) * 100) : 0;
    return [
      { label: "地毯档案", value: archives.length },
      { label: "待清洗", value: pending },
      { label: "清洗中 / 挂起池位", value: `${washing}（挂起 ${suspended}）` },
      { label: "完工率", value: `${rate}%` },
    ];
  }, [archives, entries]);

  // ---- 档案 ----
  function addCarpet(id: string, origin: string): string | null {
    if (carpetIds.has(id)) return `编号 ${id} 已存在，不能重复登记`;
    setState((s) => ({
      ...s,
      archives: [...s.archives, { id, origin, createdAt: new Date().toISOString() }],
    }));
    return null;
  }

  function removeCarpet(id: string): void {
    setState((s) => ({ ...s, archives: s.archives.filter((c) => c.id !== id) }));
  }

  // ---- 批量排期（事务） ----
  function commitBatch(drafts: BatchDraft[]): BatchResult {
    const result = evaluateBatch(drafts, carpetIds, entries);
    if (!result.ok) return result; // 整批退回：state 不动
    const now = new Date().toISOString();
    const newEntries: ScheduleEntry[] = drafts.map((d) => ({
      id: uid("ENT"),
      carpetId: d.carpetId.trim(),
      poolId: d.poolId,
      date: d.date,
      start: timeToMinutes(d.startTime),
      duration: Math.floor(Number(d.durationText)),
      status: "scheduled",
      createdAt: now,
    }));
    setState((s) => ({ ...s, entries: [...s.entries, ...newEntries] }));
    return { ok: true, violations: [] };
  }

  // ---- 状态流转 ----
  function transition(entryId: string, next: EntryStatus): void {
    setState((s) => ({
      ...s,
      entries: s.entries.map((e) => (e.id === entryId ? { ...e, status: next } : e)),
    }));
  }

  function suspend(entryId: string): void {
    // 池位保留：条目不删除、不释放时段，仅置为挂起
    transition(entryId, "suspended");
  }

  function registerFix(entryId: string, note: string): string | null {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return "排期不存在";
    if (entry.status !== "suspended") return "只有脱色挂起的条目需要固色登记";
    if (!note.trim()) return "请填写固色做法/用料";
    const log = {
      id: uid("FIX"),
      entryId,
      carpetId: entry.carpetId,
      poolId: entry.poolId,
      fixedAt: new Date().toISOString(),
      note: note.trim(),
    };
    setState((s) => ({
      ...s,
      fixLogs: [...s.fixLogs, log],
      // 补做固色登记后才可继续
      entries: s.entries.map((e) =>
        e.id === entryId ? { ...e, status: "washing" as EntryStatus } : e,
      ),
    }));
    return null;
  }

  function cancelEntry(entryId: string): void {
    setState((s) => ({
      ...s,
      entries: s.entries.filter((e) => e.id !== entryId),
    }));
  }

  function resetDemo(): void {
    if (!window.confirm("清空浏览器本地数据并恢复演示数据？")) return;
    clearStoredState();
    reset(buildSeedState());
  }

  return (
    <main className="app">
      <section className="hero">
        <p>手工地毯清洗工作室 · 排期台 · 数据仅存本机浏览器</p>
        <h1>手工地毯清洗排期台</h1>
        <span>
          登记地毯编号、产地与清洗池时段；同池同时段（含首尾压边）只接待一条地毯，
          超出当日容量的批量整批退回；清洗中发现脱色即挂起并保留池位，补做固色登记后方可继续。
        </span>
        <div className="hero-actions">
          <button type="button" onClick={resetDemo}>恢复演示数据</button>
        </div>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <section className="workspace workspace-split">
        <ArchivePanel
          archives={archives}
          busyCarpetIds={busyCarpetIds}
          onAdd={addCarpet}
          onRemove={removeCarpet}
        />
        <BatchPanel archives={archives} entries={entries} onCommit={commitBatch} />
      </section>

      <ScheduleBoard
        entries={entries}
        archives={archives}
        fixLogs={fixLogs}
        onTransition={transition}
        onSuspend={suspend}
        onRegisterFix={registerFix}
        onCancel={cancelEntry}
      />
    </main>
  );
}

function timeToMinutes(text: string): number {
  const [h, m] = text.trim().split(":").map(Number);
  return h * 60 + m;
}

export default App;
