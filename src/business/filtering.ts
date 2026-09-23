// 列表筛选模块：从仓库状态派生排期看板与档案列表，全部为纯函数。

import {
  POOLS,
  fmtMin,
  isOccupying,
} from "./scheduling";
import type { Booking, Carpet, FixLog } from "./types";

export type StatusFilter = "all" | Booking["status"];

export interface ListFilters {
  keyword: string;
  origin: string; // "all" 或产地名
  poolId: string; // "all" 或池 id
  status: StatusFilter;
}

export interface CarpetRow {
  carpet: Carpet;
  /** 当前/最近一单（挂起优先，其次未完工，再退最近一单） */
  activeBooking: Booking | null;
  fixCount: number;
  statusLabel: string;
  status: Booking["status"] | "idle";
}

const STATUS_PRIORITY: Record<Booking["status"], number> = {
  suspended: 0,
  washing: 1,
  scheduled: 2,
  completed: 3,
};

export function buildCarpetRows(
  carpets: readonly Carpet[],
  bookings: readonly Booking[],
  fixLogs: readonly FixLog[],
): CarpetRow[] {
  return carpets
    .map((carpet) => {
      const mine = bookings.filter((b) => b.carpetCode === carpet.code);
      const pending = mine
        .filter((b) => b.status !== "completed")
        .sort((a, b) => {
          const gap = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
          if (gap !== 0) return gap;
          return (a.date + String(a.startMin)).localeCompare(
            b.date + String(b.startMin),
          );
        });
      // 未完工单优先（挂起最先）；都完工后回退最近一单，列表仍显示“已完工”
      const active = (
        pending.length > 0
          ? pending
          : [...mine].sort((a, b) =>
              (b.date + String(b.startMin)).localeCompare(
                a.date + String(a.startMin),
              ),
            )
      )[0] as Booking | undefined;
      const fixCount = fixLogs.filter(
        (log) => log.carpetCode === carpet.code,
      ).length;
      if (active) {
        return {
          carpet,
          activeBooking: active,
          fixCount,
          statusLabel: STATUS_TEXT[active.status],
          status: active.status,
        };
      }
      return {
        carpet,
        activeBooking: null,
        fixCount,
        statusLabel: "待排期",
        status: "idle" as const,
      };
    })
    .sort((a, b) => b.carpet.createdAt - a.carpet.createdAt);
}

const STATUS_TEXT = {
  scheduled: "已排期",
  washing: "清洗中",
  suspended: "脱色挂起",
  completed: "已完工",
} as const;

export function filterCarpetRows(
  rows: readonly CarpetRow[],
  filters: ListFilters,
): CarpetRow[] {
  const keyword = filters.keyword.trim().toUpperCase();
  return rows.filter((row) => {
    if (keyword) {
      const haystack =
        `${row.carpet.code} ${row.carpet.origin} ${row.carpet.note ?? ""}`.toUpperCase();
      if (!haystack.includes(keyword)) return false;
    }
    if (filters.origin !== "all" && row.carpet.origin !== filters.origin)
      return false;
    if (filters.poolId !== "all" && row.carpet.poolId !== filters.poolId)
      return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    return true;
  });
}

export interface PoolColumn {
  poolId: string;
  poolName: string;
  /** 当日已占用分钟数（完工单释放池位，不计） */
  usedMin: number;
  capacityMin: number;
  bookings: Array<Booking & { carpetCode: string; endMin: number; window: string }>;
}

export function buildPoolBoard(
  bookings: readonly Booking[],
  date: string,
): PoolColumn[] {
  return POOLS.map((pool) => {
    const dayBookings = bookings
      .filter((b) => b.poolId === pool.id && b.date === date)
      .sort((a, b) => a.startMin - b.startMin);
    const usedMin = dayBookings
      .filter((b) => isOccupying(b.status))
      .reduce((sum, b) => sum + b.durationMin, 0);
    return {
      poolId: pool.id,
      poolName: pool.name,
      usedMin,
      capacityMin: pool.capacityMin,
      bookings: dayBookings.map((b) => ({
        ...b,
        endMin: b.startMin + b.durationMin,
        window: `${fmtMin(b.startMin)}–${fmtMin(b.startMin + b.durationMin)}`,
      })),
    };
  });
}

export function collectOrigins(carpets: readonly Carpet[]): string[] {
  return [...new Set(carpets.map((c) => c.origin))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
}
