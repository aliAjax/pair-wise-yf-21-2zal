// 排期规则模块：清洗池容量、压边冲突、批量整单校验、清洗状态流转
// 纯函数，不依赖 React 与 localStorage，便于独立验证。

import type {
  BatchError,
  Booking,
  BookingStatus,
  Carpet,
  FixLog,
} from "./types";

export interface Pool {
  id: string;
  name: string;
  /** 当日开放起点（分钟，00:00 起） */
  openMin: number;
  /** 当日容量（分钟），末单必须在 openMin + capacityMin 前结束 */
  capacityMin: number;
}

export const POOLS: Pool[] = [
  { id: "P1", name: "一号清水池", openMin: 9 * 60, capacityMin: 10 * 60 },
  { id: "P2", name: "二号冷水池", openMin: 9 * 60, capacityMin: 10 * 60 },
  { id: "P3", name: "三号温水池", openMin: 9 * 60, capacityMin: 9 * 60 },
];

export function getPool(poolId: string): Pool | undefined {
  return POOLS.find((pool) => pool.id === poolId);
}

/** 同一池同一时段的占用状态：挂起也保留池位，参与冲突判定 */
const OCCUPYING_STATUSES: ReadonlySet<BookingStatus> = new Set([
  "scheduled",
  "washing",
  "suspended",
]);

export function isOccupying(status: BookingStatus): boolean {
  return OCCUPYING_STATUSES.has(status);
}

/** 分钟转 HH:MM */
export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** HH:MM 转分钟；非法返回 null */
export function parseHHMM(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * 压边判定：同一池（或同一地毯）同一日的两单，时间区间有任何接触即冲突。
 * 结束时刻与下一单开始贴边也算压边（湿毯与换水需要缓冲，杜绝“擦边”），
 * 故按闭区间相交处理：a.start <= b.end 且 b.start <= a.end。
 */
export function isPressing(a: SlotLike, b: SlotLike): boolean {
  return (
    a.date === b.date &&
    a.startMin <= b.startMin + b.durationMin &&
    b.startMin <= a.startMin + a.durationMin
  );
}

interface SlotLike {
  date: string;
  startMin: number;
  durationMin: number;
}

/** 校验一单是否落在该池当日开放窗口与容量内 */
export function withinPoolCapacity(pool: Pool, startMin: number, durationMin: number): boolean {
  return (
    durationMin > 0 &&
    startMin >= pool.openMin &&
    startMin + durationMin <= pool.openMin + pool.capacityMin
  );
}

export interface BatchRow {
  carpetCode: string;
  date: string;
  startMin: number;
}

export interface BatchPlan {
  bookings: Booking[];
}

export interface BatchContext {
  carpets: readonly Carpet[];
  bookings: readonly Booking[];
  now: number;
  idFactory: () => string;
}

/**
 * 批量排期核心：先把全部行的所有问题收集完，再决定提交。
 * 任一地毯压边已排时段或超出该池当日容量，整批退回，
 * 不返回任何 booking —— 调用方据此保持池排期与档案原样。
 */
export function planBatch(
  rows: readonly BatchRow[],
  ctx: BatchContext,
): { ok: true; plan: BatchPlan } | { ok: false; errors: BatchError[] } {
  const errors: BatchError[] = [];
  const prepared: Array<{
    row: number;
    carpetCode: string;
    slot: SlotLike & { poolId: string };
  }> = [];

  const occupied = ctx.bookings.filter((b) => isOccupying(b.status));

  rows.forEach((row, index) => {
    const rowNo = index + 1;
    const carpetCode = row.carpetCode.trim().toUpperCase();
    const rowErrors: BatchError[] = [];

    if (!carpetCode) {
      rowErrors.push({ row: rowNo, carpetCode, reason: "缺少地毯编号" });
    }
    const dateOK = /^\d{4}-\d{2}-\d{2}$/.test(row.date);
    if (!dateOK) {
      rowErrors.push({ row: rowNo, carpetCode, reason: "日期不完整" });
    }

    const carpet = carpetCode
      ? ctx.carpets.find((c) => c.code === carpetCode)
      : undefined;
    if (carpetCode && !carpet) {
      rowErrors.push({
        row: rowNo,
        carpetCode,
        reason: "档案中查无此地毯，请先登记",
      });
    }

    if (carpet && !Number.isFinite(row.startMin)) {
      rowErrors.push({ row: rowNo, carpetCode, reason: "缺少入池时间" });
    }

    if (carpet && Number.isFinite(row.startMin) && dateOK) {
      const pool = getPool(carpet.poolId);
      if (!pool) {
        rowErrors.push({
          row: rowNo,
          carpetCode,
          reason: `地毯指定的清洗池 ${carpet.poolId} 不存在`,
        });
      } else {
        const slot = {
          date: row.date,
          startMin: row.startMin,
          durationMin: carpet.durationMin,
          poolId: pool.id,
        };

        if (!withinPoolCapacity(pool, slot.startMin, slot.durationMin)) {
          rowErrors.push({
            row: rowNo,
            carpetCode,
            reason: `${pool.name}当日容量 ${fmtMin(pool.openMin)}–${fmtMin(
              pool.openMin + pool.capacityMin,
            )}，本单 ${fmtMin(slot.startMin)}–${fmtMin(
              slot.startMin + slot.durationMin,
            )} 超出容量`,
          });
        }

        // 与已排时段压边：同池冲突
        for (const existing of occupied) {
          if (
            existing.poolId === slot.poolId &&
            isPressing(existing, slot)
          ) {
            rowErrors.push({
              row: rowNo,
              carpetCode,
              reason: `${pool.name}当日 ${fmtMin(existing.startMin)}–${fmtMin(
                existing.startMin + existing.durationMin,
              )} 已接待 ${existing.carpetCode}，本单压边`,
            });
            break;
          }
        }

        // 同一条地毯同一时段不能在两个池
        for (const existing of occupied) {
          if (
            existing.carpetCode === carpetCode &&
            isPressing(existing, slot)
          ) {
            rowErrors.push({
              row: rowNo,
              carpetCode,
              reason: `该地毯当日 ${fmtMin(existing.startMin)}–${fmtMin(
                existing.startMin + existing.durationMin,
              )} 已排在${getPool(existing.poolId)?.name ?? existing.poolId}，时段压边`,
            });
            break;
          }
        }

        // 批内互检（先放进来的行）
        for (const prior of prepared) {
          const samePool = prior.slot.poolId === slot.poolId;
          const sameCarpet = prior.carpetCode === carpetCode;
          if ((samePool || sameCarpet) && isPressing(prior.slot, slot)) {
            rowErrors.push({
              row: rowNo,
              carpetCode,
              reason: `与本批第 ${prior.row} 行（${prior.carpetCode}）时段压边`,
            });
            break;
          }
        }

        prepared.push({ row: rowNo, carpetCode, slot });
      }
    }

    errors.push(...rowErrors);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const bookings: Booking[] = prepared.map(({ row, carpetCode, slot }) => {
    const carpet = ctx.carpets.find((c) => c.code === carpetCode)!;
    return {
      id: ctx.idFactory(),
      carpetCode,
      originSnapshot: carpet.origin,
      poolId: slot.poolId,
      date: slot.date,
      startMin: slot.startMin,
      durationMin: slot.durationMin,
      status: "scheduled",
      createdAt: ctx.now,
    };
  });

  return { ok: true, plan: { bookings } };
}

// ---------- 清洗状态流转 ----------

/** 脱色挂起：清洗中 → 挂起，池位保留（排期不删除，仍占用池容量） */
export function canSuspend(status: BookingStatus): boolean {
  return status === "washing";
}

/** 补做固色登记后才可继续：挂起 → 清洗中 */
export function canResume(status: BookingStatus, fixCount: number): boolean {
  return status === "suspended" && fixCount > 0;
}

/** 挂起单禁止标记完工；只有清洗中的单可完工 */
export function canComplete(status: BookingStatus): boolean {
  return status === "washing";
}

/** 尚未入池的排期可整单撤回 */
export function canCancel(status: BookingStatus): boolean {
  return status === "scheduled";
}

export function completeBlockedReason(
  status: BookingStatus,
  fixLogs: readonly FixLog[],
  bookingId: string,
): string | null {
  if (status === "scheduled") return "尚未入池，不能标记完工";
  if (status === "suspended") {
    const done = fixLogs.some((log) => log.bookingId === bookingId);
    return done
      ? "固色已补做，请先恢复清洗再标记完工"
      : "清洗中发现脱色已挂起，池位保留但不能标记完工；请先补做固色登记";
  }
  if (status === "completed") return "该单已完工";
  return null;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  scheduled: "已排期",
  washing: "清洗中",
  suspended: "脱色挂起",
  completed: "已完工",
};
