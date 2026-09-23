import type { DeskState } from "./types";
import { todayISO } from "./format";
import { uid } from "./format";

/** 首次打开时的演示数据：三条已登记地毯，其中一条今天正在清洗、一条待洗 */
export function buildSeedState(): DeskState {
  const today = todayISO();
  const now = new Date().toISOString();
  return {
    archives: [
      { id: "CAR-092", origin: "波斯", createdAt: now },
      { id: "CAR-117", origin: "安纳托利亚", createdAt: now },
      { id: "CAR-138", origin: "藏毯", createdAt: now },
      { id: "CAR-205", origin: "高加索", createdAt: now },
    ],
    entries: [
      {
        id: uid("ENT"),
        carpetId: "CAR-092",
        poolId: "POOL-1",
        date: today,
        start: 9 * 60,
        duration: 150,
        status: "washing",
        createdAt: now,
      },
      {
        id: uid("ENT"),
        carpetId: "CAR-117",
        poolId: "POOL-2",
        date: today,
        start: 14 * 60,
        duration: 120,
        status: "scheduled",
        createdAt: now,
      },
    ],
    fixLogs: [],
  };
}
