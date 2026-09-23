import { useMemo, useState } from "react";
import {
  POOLS,
  fmtMin,
  getPool,
  parseHHMM,
  planBatch,
} from "../business/scheduling";
import type { BatchRow } from "../business/scheduling";
import { todayISO } from "../business/storage";
import type { Carpet } from "../business/types";
import type { DeskStore } from "../business/storage";
import type { Notify } from "./ui";

interface DraftRow {
  carpetCode: string;
  startText: string;
}

const emptyRow: DraftRow = { carpetCode: "", startText: "10:00" };

export function BatchPlanner({
  store,
  date,
  onDateChange,
  notify,
}: {
  store: DeskStore;
  date: string;
  onDateChange: (date: string) => void;
  notify: Notify;
}) {
  const [rows, setRows] = useState<DraftRow[]>([{ ...emptyRow }]);

  const carpetByCode = useMemo(() => {
    const map = new Map<string, Carpet>();
    store.state.carpets.forEach((c) => map.set(c.code, c));
    return map;
  }, [store.state.carpets]);

  const updateRow = (index: number, patch: Partial<DraftRow>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  // 提交前的整批预检：与正式提交走同一套规则（planBatch），
  // 但只用于提示，不写入任何数据。
  const preview = useMemo(() => {
    const batchRows: BatchRow[] = rows
      .filter((r) => r.carpetCode.trim() !== "" || r.startText.trim() !== "")
      .map((r) => ({
        carpetCode: r.carpetCode.trim().toUpperCase(),
        date,
        startMin: parseHHMM(r.startText) ?? Number.NaN,
      }));
    if (batchRows.length === 0) {
      return { count: 0, errors: [] as ReturnType<typeof liveErrors> };
    }
    const result = planBatch(batchRows, {
      carpets: store.state.carpets,
      bookings: store.state.bookings,
      now: Date.now(),
      idFactory: () => "preview",
    });
    return {
      count: batchRows.length,
      errors: result.ok ? [] : liveErrors(result.errors),
    };
  }, [rows, date, store.state.carpets, store.state.bookings]);

  const submit = () => {
    const payload: BatchRow[] = rows.map((r) => ({
      carpetCode: r.carpetCode.trim().toUpperCase(),
      date,
      startMin: parseHHMM(r.startText) ?? Number.NaN,
    }));
    const result = store.submitBatch(payload);
    notify(result);
    if (result.ok) setRows([{ ...emptyRow }]);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>批量排期</p>
          <h2>排入清洗池</h2>
        </div>
        <div className="batch-head">
          <label className="date-label">
            <span>排期日期</span>
            <input
              type="date"
              value={date}
              min={todayISO()}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </label>
          <button className="primary" onClick={submit}>
            整批提交
          </button>
        </div>
      </div>

      <p className="rule-note">
        规则：同一清洗池同一时段只接待一条地毯，结束时刻贴边也算压边；任一地毯与已排时段压边或超出该池当日容量，
        <b>整批退回</b>，池排期与档案保持原样。
      </p>

      <div className="batch-rows">
        <datalist id="carpet-codes">
          {store.state.carpets.map((c) => (
            <option key={c.code} value={c.code}>
              {c.origin} · {getPool(c.poolId)?.name ?? c.poolId}
            </option>
          ))}
        </datalist>
        <div className="batch-row batch-row-head">
          <span>#</span>
          <span>地毯编号</span>
          <span>入池时间</span>
          <span>占用窗口（取档案中的池与时长）</span>
          <span aria-label="操作" />
        </div>
        {rows.map((row, index) => {
          const carpet = carpetByCode.get(row.carpetCode.trim().toUpperCase());
          const pool = carpet ? getPool(carpet.poolId) : undefined;
          const startMin = parseHHMM(row.startText);
          const windowText =
            carpet && pool && startMin != null
              ? `${pool.name} · ${fmtMin(startMin)}–${fmtMin(
                  startMin + carpet.durationMin,
                )}`
              : "选择档案内的地毯后自动计算";
          return (
            <div className="batch-row" key={index}>
              <b>{index + 1}</b>
              <input
                list="carpet-codes"
                value={row.carpetCode}
                placeholder="CAR-092"
                onChange={(e) =>
                  updateRow(index, { carpetCode: e.target.value.toUpperCase() })
                }
              />
              <input
                type="time"
                value={row.startText}
                onChange={(e) => updateRow(index, { startText: e.target.value })}
              />
              <span className="batch-window">{windowText}</span>
              <button
                className="link-btn"
                disabled={rows.length === 1}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              >
                删除
              </button>
            </div>
          );
        })}
      </div>

      <div className="batch-foot">
        <button
          onClick={() => setRows((prev) => [...prev, { ...emptyRow }])}
        >
          + 增加一行
        </button>
        {preview.count > 0 &&
          (preview.errors.length === 0 ? (
            <span className="hint-ok">预检通过：{preview.count} 单可整体排入</span>
          ) : (
            <span className="hint-err">
              预检发现 {preview.errors.length} 项问题，提交将整批退回：
              {preview.errors.map((e) => (
                <em key={`${e.row}-${e.reason}`}>
                  第{e.row}行 {e.reason}；
                </em>
              ))}
            </span>
          ))}
      </div>

      <details className="day-brief">
        <summary>当日已排占用（{date}）</summary>
        <ul>
          {POOLS.map((pool) => {
            const list = store.state.bookings.filter(
              (b) => b.poolId === pool.id && b.date === date &&
                b.status !== "completed",
            );
            return (
              <li key={pool.id}>
                <b>{pool.name}</b>
                {list.length === 0 ? (
                  <span> 无占用</span>
                ) : (
                  list
                    .slice()
                    .sort((a, b) => a.startMin - b.startMin)
                    .map((b) => (
                      <span key={b.id} className="chip">
                        {fmtMin(b.startMin)}–{fmtMin(b.startMin + b.durationMin)}{" "}
                        {b.carpetCode}
                      </span>
                    ))
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

function liveErrors(errors: readonly { row: number; reason: string }[]) {
  return errors.map((e) => ({ row: e.row, reason: e.reason }));
}
