import { useMemo, useState, type ChangeEvent } from "react";
import type { Carpet, EntryStatus, FixLog, ScheduleEntry } from "../business/types";
import { filterEntries, poolDayUsage } from "../business/filtering";
import {
  POOLS,
  STATUS_LABEL,
  canTransition,
} from "../business/schedulingRules";
import { formatDateTime, formatSlot, todayISO } from "../business/format";

interface Props {
  entries: ScheduleEntry[];
  archives: Carpet[];
  fixLogs: FixLog[];
  onTransition: (id: string, next: EntryStatus) => void;
  onSuspend: (id: string) => void;
  onRegisterFix: (entryId: string, note: string) => string | null;
  onCancel: (id: string) => void;
}

const ORIGIN_CHIPS = ["波斯", "安纳托利亚", "高加索", "藏毯", "土库曼"];
const STATUS_OPTIONS: Array<{ value: EntryStatus | "all"; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "scheduled", label: "待清洗" },
  { value: "washing", label: "清洗中" },
  { value: "suspended", label: "脱色挂起" },
  { value: "done", label: "已完工" },
];

export default function ScheduleBoard({
  entries,
  archives,
  fixLogs,
  onTransition,
  onSuspend,
  onRegisterFix,
  onCancel,
}: Props) {
  const [origin, setOrigin] = useState("all");
  const [poolId, setPoolId] = useState("all");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<EntryStatus | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixNote, setFixNote] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);

  const carpetMap = useMemo(() => new Map(archives.map((c) => [c.id, c])), [archives]);
  const poolMap = useMemo(() => new Map(POOLS.map((p) => [p.id, p])), []);

  const origins = useMemo(() => {
    const used = new Set(archives.map((a) => a.origin));
    return ["all", ...ORIGIN_CHIPS.filter((o) => used.has(o)), ...[...used].filter((o) => !ORIGIN_CHIPS.includes(o))];
  }, [archives]);

  const visible = useMemo(
    () => filterEntries(entries, archives, { origin, poolId, date, status, keyword }),
    [entries, archives, origin, poolId, date, status, keyword],
  );

  const logsFor = (entryId: string) =>
    fixLogs.filter((l) => l.entryId === entryId).sort((a, b) => b.fixedAt.localeCompare(a.fixedAt));

  function submitFix(entryId: string) {
    const err = onRegisterFix(entryId, fixNote);
    if (err) {
      setFixError(err);
      return;
    }
    setFixError(null);
    setFixNote("");
    setFixingId(null);
  }

  return (
    <section className="panel board">
      <div className="heading">
        <div>
          <p>池位看板</p>
          <h2>清洗排期列表</h2>
        </div>
        <span className="count-badge">{visible.length} / {entries.length} 条</span>
      </div>

      <div className="board-filters">
        <select value={origin} onChange={(e: ChangeEvent<HTMLSelectElement>) => setOrigin(e.target.value)}>
          {origins.map((o: string) => (
            <option key={o} value={o}>{o === "all" ? "全部产地" : o}</option>
          ))}
        </select>
        <select value={poolId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setPoolId(e.target.value)}>
          <option value="all">全部清洗池</option>
          {POOLS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as EntryStatus | "all")}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} />
        <button type="button" className="ghost" onClick={() => setDate(todayISO())}>
          今天
        </button>
        <button type="button" className="ghost" onClick={() => setDate("")}>
          不限日期
        </button>
        <input
          className="grow"
          value={keyword}
          placeholder="按地毯编号搜索"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
        />
      </div>

      <div className="entry-list">
        {visible.length === 0 && <p className="empty">当前筛选条件下没有排期。</p>}
        {visible.map((e) => {
          const carpet = carpetMap.get(e.carpetId);
          const pool = poolMap.get(e.poolId);
          const used = poolDayUsage(entries, e.poolId, e.date);
          const cap = pool?.dailyCapacityMinutes ?? 0;
          const logs = logsFor(e.id);
          return (
            <article key={e.id} className={`entry status-${e.status}`}>
              <div className="entry-main">
                <div className="entry-id">
                  <h3>
                    {e.carpetId}
                    <span className="tag origin">{carpet?.origin ?? "档案缺失"}</span>
                    <span className={`tag status-${e.status}`}>{STATUS_LABEL[e.status]}</span>
                  </h3>
                  <p>
                    {pool?.name ?? e.poolId} · {e.date} · {formatSlot(e.start, e.duration)}
                  </p>
                  <p className="muted">
                    当日该池已排 {used} / {cap} 分钟
                    {e.status === "suspended" && " · 脱色挂起中，池位保留、不可完工"}
                  </p>
                </div>
                <div className="entry-actions">
                  {e.status === "scheduled" && (
                    <button type="button" className="primary small" onClick={() => onTransition(e.id, "washing")}>
                      开始清洗
                    </button>
                  )}
                  {e.status === "washing" && (
                    <>
                      <button type="button" className="primary small" onClick={() => onTransition(e.id, "done")}
                        disabled={!canTransition(e.status, "done")}>
                        标记完工
                      </button>
                      <button type="button" className="warn small" onClick={() => onSuspend(e.id)}>
                        发现脱色 · 挂起
                      </button>
                    </>
                  )}
                  {e.status === "suspended" && (
                    <button
                      type="button"
                      className={fixingId === e.id ? "accent small active" : "accent small"}
                      onClick={() => {
                        setFixingId(fixingId === e.id ? null : e.id);
                        setFixError(null);
                      }}
                    >
                      补做固色登记
                    </button>
                  )}
                  {e.status !== "done" && (
                    <button
                      type="button"
                      className="ghost small danger-text"
                      onClick={() => {
                        if (window.confirm(`取消 ${e.carpetId} 在 ${pool?.name} ${e.date} 的排期？`)) {
                          onCancel(e.id);
                        }
                      }}
                    >
                      取消排期
                    </button>
                  )}
                </div>
              </div>

              {e.status === "suspended" && fixingId === e.id && (
                <div className="fix-form">
                  <label>
                    <span>固色做法 / 用料 / 操作人（登记后方可继续清洗）</span>
                    <textarea
                      rows={2}
                      value={fixNote}
                      placeholder="如：醋酸固色剂二次浸泡 20 分钟，自然阴干，操作人阿依古丽"
                      onChange={(ev: ChangeEvent<HTMLTextAreaElement>) => setFixNote(ev.target.value)}
                    />
                  </label>
                  {fixError && <p className="banner error">{fixError}</p>}
                  <div className="fix-actions">
                    <button type="button" className="accent" onClick={() => submitFix(e.id)}>
                      提交固色登记并继续清洗
                    </button>
                  </div>
                </div>
              )}

              {logs.length > 0 && (
                <div className="fix-logs">
                  {logs.map((l) => (
                    <p key={l.id} className="fix-log">
                      <span className="tag done">已固色</span>
                      {formatDateTime(l.fixedAt)}：{l.note}
                    </p>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
