import type { ActionResult, BatchError, BookingStatus } from "../business/types";
import { STATUS_LABEL } from "../business/scheduling";

export type Notify = (result: ActionResult) => void;

export interface NoticeState {
  key: number;
  ok: boolean;
  message: string;
  errors?: BatchError[];
}

export function Notice({ notice }: { notice: NoticeState | null }) {
  if (!notice) return null;
  return (
    <div className={`notice ${notice.ok ? "notice-ok" : "notice-err"}`} role="alert">
      <strong>{notice.ok ? "操作成功" : "操作被拒绝"}</strong>
      <span>{notice.message}</span>
      {notice.errors && notice.errors.length > 0 && (
        <ul className="notice-errors">
          {notice.errors.map((err) => (
            <li key={`${err.row}-${err.reason}`}>
              第 {err.row} 行{err.carpetCode ? ` · ${err.carpetCode}` : ""}：
              {err.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BADGE_CLASS: Record<BookingStatus | "idle", string> = {
  idle: "badge-idle",
  scheduled: "badge-scheduled",
  washing: "badge-washing",
  suspended: "badge-suspended",
  completed: "badge-completed",
};

export function StatusBadge({
  status,
}: {
  status: BookingStatus | "idle";
}) {
  const label =
    status === "idle" ? "待排期" : STATUS_LABEL[status as BookingStatus];
  return <span className={`badge ${BADGE_CLASS[status]}`}>{label}</span>;
}
