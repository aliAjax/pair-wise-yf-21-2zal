import { useCallback, useEffect, useState } from "react";
import type { DeskState } from "./types";

/**
 * 状态存取模块：数据只存浏览器本地（localStorage），不引入任何依赖。
 * 规则/筛选模块不知道存储的存在；这里只负责读写、容错与 hook 封装。
 */

const STORAGE_KEY = "rug-cleaning-schedule-desk:v1";

/** 读取本地状态；缺失或损坏时返回 null（交由调用方决定是否播种演示数据） */
export function loadState(): DeskState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isDeskState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写入本地状态；失败（隐私模式/配额）时静默降级为内存态 */
export function saveState(state: DeskState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 不可用时不影响本次会话内的使用
  }
}

export function clearStoredState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** 结构性校验，防止脏数据直接灌进界面 */
function isDeskState(v: unknown): v is DeskState {
  if (!isObject(v) || !Array.isArray(v.archives) || !Array.isArray(v.entries) || !Array.isArray(v.fixLogs)) {
    return false;
  }
  return (
    v.archives.every(
      (a) =>
        isObject(a) &&
        typeof a.id === "string" &&
        typeof a.origin === "string" &&
        typeof a.createdAt === "string",
    ) &&
    v.entries.every(
      (e) =>
        isObject(e) &&
        typeof e.id === "string" &&
        typeof e.carpetId === "string" &&
        typeof e.poolId === "string" &&
        typeof e.date === "string" &&
        typeof e.start === "number" &&
        typeof e.duration === "number" &&
        ["scheduled", "washing", "suspended", "done"].includes(String(e.status)) &&
        typeof e.createdAt === "string",
    ) &&
    v.fixLogs.every(
      (f) =>
        isObject(f) &&
        typeof f.id === "string" &&
        typeof f.entryId === "string" &&
        typeof f.carpetId === "string" &&
        typeof f.poolId === "string" &&
        typeof f.fixedAt === "string" &&
        typeof f.note === "string",
    )
  );
}

/** 本地持久化状态 hook：初始化读一次，之后每次变更写回 */
export function usePersistentState(initial: DeskState) {
  const [state, setState] = useState<DeskState>(() => loadState() ?? initial);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const reset = useCallback((next: DeskState) => {
    setState(next);
  }, []);

  return [state, setState, reset] as const;
}
