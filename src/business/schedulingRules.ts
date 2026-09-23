import type {
  CleaningPool,
  EntryStatus,
  ScheduleEntry,
} from "./types";

/**
 * 排期规则模块
 * 规则要点：
 * 1. 同一清洗池同一时段只接待一条地毯；时段按闭区间判定，首尾相接（压边）也算冲突。
 * 2. 同一池当日所有条目预计时长之和不得超过该池当日容量。
 * 3. 批量排期为事务：任一地毯压边/超容量/字段非法，整批退回，已有池排期与档案保持原样。
 * 4. 脱色挂起期间池位保留（占用仍计入冲突与容量），补做固色登记后才可继续，且挂起中不能完工。
 */

export const POOLS: CleaningPool[] = [
  { id: "POOL-1", name: "一号清洗池", dailyCapacityMinutes: 600 },
  { id: "POOL-2", name: "二号清洗池", dailyCapacityMinutes: 480 },
  { id: "POOL-3", name: "三号清洗池", dailyCapacityMinutes: 420 },
];

/** 一天 24 小时内的排期窗口上限（分钟） */
export const DAY_MINUTES = 24 * 60;

/** 批量排期表单里的一条草稿 */
export interface BatchDraft {
  carpetId: string;
  poolId: string;
  date: string;
  /** "HH:MM"，空串/非法字符串表示未填 */
  startTime: string;
  /** 预计时长（分钟），空串表示未填 */
  durationText: string;
}

/** 校验失败项：rows 为批量草稿中触雷的行号（1 起，可多行，如容量超限） */
export interface Violation {
  rows: number[];
  message: string;
}

/** 批量排期的完整裁决结果 */
export interface BatchResult {
  ok: boolean;
  violations: Violation[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** "HH:MM" → 距零点分钟数；非法返回 NaN */
export function parseTime(text: string): number {
  const m = TIME_RE.exec(text.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** 合法 YYYY-MM-DD（按公历存在性宽松校验，2 月 30 日之类判非法） */
export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

function poolOf(poolId: string): CleaningPool | undefined {
  return POOLS.find((p) => p.id === poolId);
}

/**
 * 两条时段是否抢占同一池位。
 * 占用按 [start, end] 闭区间判定：
 * A.end === B.start（首尾相接、压边）即视为冲突，不允许贴边衔接。
 */
export function overlaps(
  a: Pick<ScheduleEntry, "start" | "duration">,
  b: Pick<ScheduleEntry, "start" | "duration">,
): boolean {
  return a.start <= b.start + b.duration && b.start <= a.start + a.duration;
}

/** 结构化通过校验的待排条目 */
interface PlannedItem extends BatchDraft {
  row: number;
  start: number;
  duration: number;
}

/**
 * 对一整批草稿做事务性校验：
 * 不修改任何已有数据；只有全部通过才 ok=true。
 * @param archives 已登记地毯编号集合（排期必须先有档案）
 * @param existing 已排条目（含挂起条目——池位保留）
 */
export function evaluateBatch(
  drafts: BatchDraft[],
  archives: ReadonlySet<string>,
  existing: readonly ScheduleEntry[],
): BatchResult {
  const violations: Violation[] = [];
  const planned: PlannedItem[] = [];

  if (drafts.length === 0) {
    return { ok: false, violations: [{ rows: [], message: "批量清单为空，没有可排期的地毯" }] };
  }

  // 第一步：逐行字段校验
  drafts.forEach((d, i) => {
    const row = i + 1;
    const problems: string[] = [];

    if (!d.carpetId.trim()) {
      problems.push("未选择地毯");
    } else if (!archives.has(d.carpetId.trim())) {
      problems.push(`地毯 ${d.carpetId.trim()} 尚未登记档案`);
    }

    const pool = poolOf(d.poolId);
    if (!pool) problems.push("未选择清洗池");

    if (!isValidDate(d.date)) problems.push("日期无效");

    const start = parseTime(d.startTime);
    if (Number.isNaN(start)) problems.push("开始时间无效（格式 HH:MM）");

    const duration = Number(d.durationText);
    if (!Number.isFinite(duration) || duration <= 0 || Math.floor(duration) !== duration) {
      problems.push("预计时长须为正整数分钟");
    } else if (!Number.isNaN(start) && start + duration > DAY_MINUTES) {
      problems.push("结束时刻超出当日 24:00");
    }

    if (problems.length) violations.push({ rows: [row], message: `第 ${row} 行：${problems.join("；")}` });
    else {
      planned.push({ ...d, carpetId: d.carpetId.trim(), row, start, duration });
    }
  });

  if (planned.length === 0) return { ok: false, violations };

  // 第二步：批内同池同日压边（含批内同一条地毯重复出现的情形）
  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) {
      const a = planned[i];
      const b = planned[j];
      if (
        a.poolId === b.poolId &&
        a.date === b.date &&
        overlaps(a, b)
      ) {
        violations.push({
          rows: [a.row, b.row],
          message: `第 ${a.row} 行与第 ${b.row} 行在同一清洗池同时段压边`,
        });
      }
    }
  }

  // 第三步：与已排条目压边（挂起条目保留池位，同样挡占）
  for (const item of planned) {
    const blockers = existing.filter(
      (e) => e.poolId === item.poolId && e.date === item.date && overlaps(e, item),
    );
    for (const hit of blockers) {
      violations.push({
        rows: [item.row],
        message:
          `第 ${item.row} 行（${item.carpetId}）与已排的 ${hit.carpetId} 在 ${item.poolId} 压边` +
          `${hit.status === "suspended" ? "（对方脱色挂起、池位保留）" : ""}`,
      });
    }
  }

  // 第四步：同池同日容量——已排总时长 + 本批该池当天各行时长之和
  const groups = new Map<string, PlannedItem[]>();
  for (const item of planned) {
    const key = `${item.poolId}|${item.date}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  for (const [key, items] of groups) {
    const [poolId, date] = key.split("|");
    const pool = poolOf(poolId)!;
    const used = existing
      .filter((e) => e.poolId === poolId && e.date === date)
      .reduce((sum, e) => sum + e.duration, 0);
    const incoming = items.reduce((sum, it) => sum + it.duration, 0);
    if (used + incoming > pool.dailyCapacityMinutes) {
      violations.push({
        rows: items.map((it) => it.row),
        message:
          `${pool.name} ${date} 当日容量 ${pool.dailyCapacityMinutes} 分钟：已排 ${used} 分钟，` +
          `本批再排入 ${incoming} 分钟，超出 ${used + incoming - pool.dailyCapacityMinutes} 分钟`,
      });
    }
  }

  return violations.length ? { ok: false, violations } : { ok: true, violations: [] };
}

export const STATUS_LABEL: Record<EntryStatus, string> = {
  scheduled: "待清洗",
  washing: "清洗中",
  suspended: "脱色挂起",
  done: "已完工",
};

/** 允许的状态流转；挂起条目只有补做固色登记后才能回到“清洗中”，且不能直接完工 */
export function canTransition(current: EntryStatus, next: EntryStatus): boolean {
  if (current === next) return false;
  const allowed: Record<EntryStatus, EntryStatus[]> = {
    scheduled: ["washing"],
    washing: ["done", "suspended"],
    // suspended → washing 必须发生在固色登记动作里（组件层保证）
    suspended: ["washing"],
    done: [],
  };
  return allowed[current].includes(next);
}
