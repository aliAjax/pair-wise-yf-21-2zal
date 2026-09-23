import type { Carpet, EntryStatus, ScheduleEntry } from "./types";

/**
 * 列表筛选模块：全部为纯函数，不触碰存储与排期规则。
 */

export interface ArchiveFilter {
  /** "all" 或具体产地 */
  origin: string;
  /** 编号/产地模糊关键字 */
  keyword: string;
}

export interface EntryFilter {
  origin: string;
  poolId: string;
  date: string;
  status: EntryStatus | "all";
  keyword: string;
}

function hitKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.trim().toLowerCase());
}

export function filterArchives(archives: readonly Carpet[], f: ArchiveFilter): Carpet[] {
  return archives.filter((c) => {
    if (f.origin !== "all" && c.origin !== f.origin) return false;
    if (f.keyword.trim() && !hitKeyword(`${c.id} ${c.origin}`, f.keyword)) return false;
    return true;
  });
}

/** 按登记时间倒序 */
export function sortArchives(archives: readonly Carpet[]): Carpet[] {
  return [...archives].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * 排期列表筛选。产地需要借档案表把 carpetId 映射成 origin。
 * 排序：日期升序 → 同日开始时刻升序 → 池号。
 */
export function filterEntries(
  entries: readonly ScheduleEntry[],
  archives: readonly Carpet[],
  f: EntryFilter,
): ScheduleEntry[] {
  const originOf = new Map(archives.map((c) => [c.id, c.origin]));
  return entries
    .filter((e) => {
      if (f.poolId !== "all" && e.poolId !== f.poolId) return false;
      if (f.date && e.date !== f.date) return false;
      if (f.status !== "all" && e.status !== f.status) return false;
      if (f.origin !== "all" && originOf.get(e.carpetId) !== f.origin) return false;
      if (f.keyword.trim() && !hitKeyword(`${e.carpetId} ${e.poolId}`, f.keyword)) return false;
      return true;
    })
    .sort((a, b) =>
      a.date !== b.date
        ? a.date.localeCompare(b.date)
        : a.start !== b.start
          ? a.start - b.start
          : a.poolId.localeCompare(b.poolId),
    );
}

/** 某池某日已占用分钟数（所有未删除条目都占池位，含挂起、已完工） */
export function poolDayUsage(
  entries: readonly ScheduleEntry[],
  poolId: string,
  date: string,
): number {
  return entries
    .filter((e) => e.poolId === poolId && e.date === date)
    .reduce((sum, e) => sum + e.duration, 0);
}
