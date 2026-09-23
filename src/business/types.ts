// 清洗排期台领域模型

/** 排期条目状态 */
export type EntryStatus = "scheduled" | "washing" | "suspended" | "done";

/** 地毯档案：编号 + 产地 */
export interface Carpet {
  /** 地毯编号，唯一，如 CAR-092 */
  id: string;
  /** 产地，如 波斯 / 安纳托利亚 / 高加索 / 藏毯 */
  origin: string;
  createdAt: string;
}

/** 清洗池：池号 + 当日容量（分钟） */
export interface CleaningPool {
  id: string;
  name: string;
  /** 该池一天最多接待的清洗总时长（分钟） */
  dailyCapacityMinutes: number;
}

/** 一条排期：某条地毯在某池某日某时段的占用 */
export interface ScheduleEntry {
  id: string;
  carpetId: string;
  poolId: string;
  /** 本地日期 YYYY-MM-DD */
  date: string;
  /** 开始时刻，距 00:00 的分钟数 */
  start: number;
  /** 预计时长（分钟） */
  duration: number;
  status: EntryStatus;
  createdAt: string;
}

/** 固色登记：脱色挂起后必须补做的记录 */
export interface FixLog {
  id: string;
  entryId: string;
  carpetId: string;
  poolId: string;
  /** 登记时刻（ISO） */
  fixedAt: string;
  /** 固色做法 / 用料 / 操作人 */
  note: string;
}

/** 浏览器本地持久化的整份工作台状态 */
export interface DeskState {
  archives: Carpet[];
  entries: ScheduleEntry[];
  fixLogs: FixLog[];
}
