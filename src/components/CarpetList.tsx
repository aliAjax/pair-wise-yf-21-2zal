import { useMemo, useState } from "react";
import {
  buildCarpetRows,
  collectOrigins,
  filterCarpetRows,
  type ListFilters,
  type StatusFilter,
} from "../business/filtering";
import { POOLS, fmtMin, getPool } from "../business/scheduling";
import type { DeskStore } from "../business/storage";
import { StatusBadge } from "./ui";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "idle", label: "待排期" },
  { value: "scheduled", label: "已排期" },
  { value: "washing", label: "清洗中" },
  { value: "suspended", label: "脱色挂起" },
  { value: "completed", label: "已完工" },
];

export function CarpetList({ store }: { store: DeskStore }) {
  const [filters, setFilters] = useState<ListFilters>({
    keyword: "",
    origin: "all",
    poolId: "all",
    status: "all",
  });

  // 视图派生全部走 filtering 模块的纯函数
  const allRows = useMemo(
    () =>
      buildCarpetRows(
        store.state.carpets,
        store.state.bookings,
        store.state.fixLogs,
      ),
    [store.state],
  );
  const origins = useMemo(
    () => collectOrigins(store.state.carpets),
    [store.state.carpets],
  );
  const rows = useMemo(
    () => filterCarpetRows(allRows, filters),
    [allRows, filters],
  );

  const patch = (p: Partial<ListFilters>) =>
    setFilters((prev) => ({ ...prev, ...p }));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>档案列表</p>
          <h2>地毯档案与当前状态</h2>
        </div>
        <span className="muted">
          命中 {rows.length} / {allRows.length} 条
        </span>
      </div>

      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="搜索编号 / 产地 / 备注"
          value={filters.keyword}
          onChange={(e) => patch({ keyword: e.target.value })}
        />
        <select
          value={filters.origin}
          onChange={(e) => patch({ origin: e.target.value })}
        >
          <option value="all">全部产地</option>
          {origins.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={filters.poolId}
          onChange={(e) => patch({ poolId: e.target.value })}
        >
          <option value="all">全部清洗池</option>
          {POOLS.map((pool) => (
            <option key={pool.id} value={pool.id}>
              {pool.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => patch({ status: e.target.value as StatusFilter })}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          className="link-btn"
          onClick={() =>
            setFilters({ keyword: "", origin: "all", poolId: "all", status: "all" })
          }
        >
          清空筛选
        </button>
      </div>

      <div className="records carpet-records">
        {rows.length === 0 && <p className="empty-line">没有符合条件的档案</p>}
        {rows.map((row) => {
          const pool = getPool(row.carpet.poolId);
          return (
            <article key={row.carpet.code}>
              <b>{row.carpet.code.split("-")[1] ?? row.carpet.code}</b>
              <div>
                <div className="record-title">
                  <h3>{row.carpet.code}</h3>
                  <StatusBadge status={row.status} />
                </div>
                <p>
                  {row.carpet.origin} · {pool?.name ?? row.carpet.poolId} · 预计{" "}
                  {row.carpet.durationMin} 分钟
                  {row.fixCount > 0 && ` · 固色 ${row.fixCount} 次`}
                </p>
                {row.carpet.note && <p className="muted">{row.carpet.note}</p>}
                {row.activeBooking && (
                  <p className="booking-ref">
                    {row.activeBooking.date} {fmtMin(row.activeBooking.startMin)}
                    –
                    {fmtMin(
                      row.activeBooking.startMin + row.activeBooking.durationMin,
                    )}{" "}
                    {pool?.name ?? ""}
                    {row.activeBooking.status === "suspended" &&
                      " · 脱色挂起，池位保留中"}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
