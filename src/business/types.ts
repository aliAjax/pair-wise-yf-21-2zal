// 领域类型：地毯档案、排期、固色登记

export type BookingStatus =
  | "scheduled" // 已排期，等待入池
  | "washing" // 清洗中
  | "suspended" // 脱色挂起：池位保留，禁止完工
  | "completed"; // 已完工

export interface Carpet {
  /** 地毯编号，唯一 */
  code: string;
  /** 产地 */
  origin: string;
  /** 登记时指定的清洗池 id（对应 POOLS） */
  poolId: string;
  /** 预计清洗时长（分钟） */
  durationMin: number;
  note?: string;
  createdAt: number;
}

export interface Booking {
  id: string;
  carpetCode: string;
  /** 下单时快照的产地，避免档案修改后历史排期失真 */
  originSnapshot: string;
  poolId: string;
  /** 当地日期 YYYY-MM-DD */
  date: string;
  /** 入池时间，自当日 00:00 起的分钟数 */
  startMin: number;
  durationMin: number;
  status: BookingStatus;
  createdAt: number;
}

export interface FixLog {
  id: string;
  bookingId: string;
  carpetCode: string;
  /** 固色剂 / 固色工艺 */
  agent: string;
  note?: string;
  at: number;
}

export interface DeskState {
  version: 1;
  carpets: Carpet[];
  bookings: Booking[];
  fixLogs: FixLog[];
}

export interface BatchError {
  /** 批单行号，从 1 开始 */
  row: number;
  carpetCode: string;
  reason: string;
}

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; errors?: BatchError[] };
