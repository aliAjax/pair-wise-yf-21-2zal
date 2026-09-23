// 状态存取模块：localStorage 仓库 + React store。
// 所有写操作集中在这里，批量排期走“先校验、后整体提交”，保证整批失败时状态原样。

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  canCancel,
  canComplete,
  canSuspend,
  getPool,
  planBatch,
} from "./scheduling";
import type {
  ActionResult,
  BatchError,
  Booking,
  Carpet,
  DeskState,
  FixLog,
} from "./types";
import type { BatchRow } from "./scheduling";

const STORAGE_KEY = "rug-wash-desk:v1";

// ---------- ID / 日期工具 ----------

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

// ---------- 种子数据（仅空仓库时写入，方便首屏演示） ----------

function seedState(): DeskState {
  const today = todayISO();
  const now = Date.now();
  const carpets: Carpet[] = [
    { code: "CAR-092", origin: "波斯", poolId: "P1", durationMin: 120, note: "羊毛，约1960s，边缘磨损", createdAt: now - 50000 },
    { code: "CAR-117", origin: "安纳托利亚", poolId: "P2", durationMin: 90, note: "植物染，结密度42", createdAt: now - 40000 },
    { code: "CAR-138", origin: "藏毯", poolId: "P3", durationMin: 150, note: "局部褪色，需留意靛蓝脱色", createdAt: now - 30000 },
    { code: "CAR-205", origin: "高加索", poolId: "P1", durationMin: 180, note: "厚绒毯，耗时较长", createdAt: now - 20000 },
  ];
  const bookings: Booking[] = [
    {
      id: uid("bk"), carpetCode: "CAR-138", originSnapshot: "藏毯",
      poolId: "P3", date: today, startMin: 9 * 60, durationMin: 150,
      status: "washing", createdAt: now - 10000,
    },
    {
      id: uid("bk"), carpetCode: "CAR-092", originSnapshot: "波斯",
      poolId: "P1", date: today, startMin: 13 * 60, durationMin: 120,
      status: "scheduled", createdAt: now - 9000,
    },
  ];
  return { version: 1, carpets, bookings, fixLogs: [] };
}

// ---------- 仓库：localStorage 读写与容错 ----------

function loadState(): DeskState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeskState;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.carpets)) {
        return {
          version: 1,
          carpets: parsed.carpets,
          bookings: parsed.bookings ?? [],
          fixLogs: parsed.fixLogs ?? [],
        };
      }
    }
  } catch {
    // 本地数据损坏时回退到种子数据
  }
  return seedState();
}

// ---------- Store ----------

export interface DeskStore {
  state: DeskState;
  registerCarpet(input: {
    code: string;
    origin: string;
    poolId: string;
    durationMin: number;
    note?: string;
  }): ActionResult;
  submitBatch(rows: readonly BatchRow[]): ActionResult;
  startWashing(bookingId: string): ActionResult;
  suspendForBleeding(bookingId: string): ActionResult;
  registerFix(
    bookingId: string,
    input: { agent: string; note?: string },
  ): ActionResult;
  completeBooking(bookingId: string): ActionResult;
  cancelBooking(bookingId: string): ActionResult;
  resetAll(): void;
}

export function useDeskStore(): DeskStore {
  const [state, setState] = useState<DeskState>(loadState);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储空间受限时忽略本次持久化，内存状态仍可用
    }
  }, [state]);

  const mutate = useCallback((fn: (draft: DeskState) => void) => {
    setState((prev) => {
      const draft: DeskState = {
        version: 1,
        carpets: prev.carpets.map((c) => ({ ...c })),
        bookings: prev.bookings.map((b) => ({ ...b })),
        fixLogs: prev.fixLogs.map((f) => ({ ...f })),
      };
      fn(draft);
      return draft;
    });
  }, []);

  const registerCarpet = useCallback<DeskStore["registerCarpet"]>(
    (input) => {
      const code = input.code.trim().toUpperCase();
      const origin = input.origin.trim();
      const note = input.note?.trim();
      if (!/^[A-Za-z]{2,}-\d{2,}$/.test(code)) {
        return { ok: false, message: "地毯编号格式不对，示例：CAR-092" };
      }
      if (!origin) return { ok: false, message: "请填写产地" };
      if (!getPool(input.poolId))
        return { ok: false, message: "请选择有效的清洗池" };
      if (!Number.isInteger(input.durationMin) || input.durationMin <= 0)
        return { ok: false, message: "预计时长需为正整数分钟" };
      const dup = ref.current.carpets.some((c) => c.code === code);
      if (dup) return { ok: false, message: `编号 ${code} 已登记，不能重复建档` };

      const carpet: Carpet = {
        code,
        origin,
        poolId: input.poolId,
        durationMin: input.durationMin,
        note: note || undefined,
        createdAt: Date.now(),
      };
      mutate((draft) => {
        draft.carpets.push(carpet);
      });
      return { ok: true, message: `地毯 ${code}（${origin}）已建档` };
    },
    [mutate],
  );

  const submitBatch = useCallback<DeskStore["submitBatch"]>(
    (rows) => {
      const result = planBatch(rows, {
        carpets: ref.current.carpets,
        bookings: ref.current.bookings,
        now: Date.now(),
        idFactory: () => uid("bk"),
      });
      if (!result.ok) {
        // 整批退回：不产生任何写入，池排期与档案保持原样
        return {
          ok: false,
          message: `整批退回：${result.errors.length} 项与已排时段压边或超出池容量，已排期与档案保持原样`,
          errors: result.errors as BatchError[],
        };
      }
      mutate((draft) => {
        draft.bookings.push(...result.plan.bookings);
      });
      return {
        ok: true,
        message: `已整体排入 ${result.plan.bookings.length} 条地毯`,
      };
    },
    [mutate],
  );

  const findBooking = (id: string, draft: DeskState) =>
    draft.bookings.find((b) => b.id === id);

  const startWashing = useCallback<DeskStore["startWashing"]>(
    (bookingId) => {
      const booking = ref.current.bookings.find((b) => b.id === bookingId);
      if (!booking) return { ok: false, message: "排期单不存在" };
      if (booking.status !== "scheduled")
        return { ok: false, message: "只有已排期的单可以开始清洗" };
      mutate((draft) => {
        const b = findBooking(bookingId, draft);
        if (b) b.status = "washing";
      });
      return { ok: true, message: `${booking.carpetCode} 已入池清洗` };
    },
    [mutate],
  );

  const suspendForBleeding = useCallback<DeskStore["suspendForBleeding"]>(
    (bookingId) => {
      const booking = ref.current.bookings.find((b) => b.id === bookingId);
      if (!booking) return { ok: false, message: "排期单不存在" };
      if (!canSuspend(booking.status))
        return { ok: false, message: "只有清洗中的单可以因脱色挂起" };
      mutate((draft) => {
        const b = findBooking(bookingId, draft);
        if (b) b.status = "suspended";
      });
      return {
        ok: true,
        message: `${booking.carpetCode} 发现脱色，已挂起并保留池位`,
      };
    },
    [mutate],
  );

  const registerFix = useCallback<DeskStore["registerFix"]>(
    (bookingId, input) => {
      const agent = input.agent.trim();
      if (!agent) return { ok: false, message: "请填写固色剂或固色工艺" };
      const booking = ref.current.bookings.find((b) => b.id === bookingId);
      if (!booking) return { ok: false, message: "排期单不存在" };
      if (booking.status !== "suspended")
        return { ok: false, message: "只有脱色挂起的单需要补做固色登记" };

      // 固色登记与“恢复清洗”在同一事务：登记成功后才可继续清洗
      mutate((draft) => {
        const b = findBooking(bookingId, draft);
        if (!b) return;
        const log: FixLog = {
          id: uid("fx"),
          bookingId,
          carpetCode: b.carpetCode,
          agent,
          note: input.note?.trim() || undefined,
          at: Date.now(),
        };
        draft.fixLogs.push(log);
        b.status = "washing";
      });
      return {
        ok: true,
        message: `${booking.carpetCode} 固色登记完成（${agent}），已恢复清洗`,
      };
    },
    [mutate],
  );

  const completeBooking = useCallback<DeskStore["completeBooking"]>(
    (bookingId) => {
      const booking = ref.current.bookings.find((b) => b.id === bookingId);
      if (!booking) return { ok: false, message: "排期单不存在" };
      if (!canComplete(booking.status)) {
        if (booking.status === "suspended")
          return {
            ok: false,
            message: "脱色挂起中，池位保留但不能标记完工；请先补做固色登记",
          };
        return { ok: false, message: "当前状态不能标记完工" };
      }
      mutate((draft) => {
        const b = findBooking(bookingId, draft);
        if (b) b.status = "completed";
      });
      return { ok: true, message: `${booking.carpetCode} 清洗完工` };
    },
    [mutate],
  );

  const cancelBooking = useCallback<DeskStore["cancelBooking"]>(
    (bookingId) => {
      const booking = ref.current.bookings.find((b) => b.id === bookingId);
      if (!booking) return { ok: false, message: "排期单不存在" };
      if (!canCancel(booking.status))
        return { ok: false, message: "已入池或已完工的单不能撤回" };
      mutate((draft) => {
        draft.bookings = draft.bookings.filter((b) => b.id !== bookingId);
      });
      return { ok: true, message: `${booking.carpetCode} 的排期已撤回` };
    },
    [mutate],
  );

  const resetAll = useCallback(() => {
    setState(seedState());
  }, []);

  return {
    state,
    registerCarpet,
    submitBatch,
    startWashing,
    suspendForBleeding,
    registerFix,
    completeBooking,
    cancelBooking,
    resetAll,
  };
}
