import { useState } from "react";
import { buildPoolBoard } from "../business/filtering";
import { fmtMin } from "../business/scheduling";
import type { DeskStore } from "../business/storage";
import type { Booking, FixLog } from "../business/types";
import { StatusBadge, type Notify } from "./ui";

export function PoolBoard({
  store,
  date,
  onDateChange,
  notify,
}: {
  store: DeskStore;
  date: string;
  onDateChange: (date: string) => void;
  notify: Notify;
}) {
  const columns = buildPoolBoard(store.state.bookings, date);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>池位看板</p>
          <h2>当日清洗池排期</h2>
        </div>
        <label className="date-label">
          <span>查看日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </label>
      </div>

      <div className="pool-grid">
        {columns.map((col) => {
          const ratio = Math.min(100, Math.round((col.usedMin / col.capacityMin) * 100));
          return (
            <article key={col.poolId} className="pool-col">
              <header>
                <h3>{col.poolName}</h3>
                <span className={ratio >= 100 ? "cap cap-full" : "cap"}>
                  已占 {col.usedMin}/{col.capacityMin} 分钟
                </span>
                <div className="cap-bar">
                  <i style={{ width: `${ratio}%` }} />
                </div>
              </header>
              {col.bookings.length === 0 ? (
                <p className="empty-line">当日无排期</p>
              ) : (
                col.bookings.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    fixLogs={store.state.fixLogs}
                    store={store}
                    notify={notify}
                  />
                ))
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BookingCard({
  booking,
  fixLogs,
  store,
  notify,
}: {
  booking: Booking & { endMin: number; window: string };
  fixLogs: readonly FixLog[];
  store: DeskStore;
  notify: Notify;
}) {
  const [showFix, setShowFix] = useState(false);
  const [agent, setAgent] = useState("");
  const [note, setNote] = useState("");
  const myFixes = fixLogs.filter((log) => log.bookingId === booking.id);

  const submitFix = () => {
    const result = store.registerFix(booking.id, { agent, note });
    notify(result);
    if (result.ok) {
      setShowFix(false);
      setAgent("");
      setNote("");
    }
  };

  return (
    <div className={`booking-card booking-${booking.status}`}>
      <div className="booking-top">
        <b>{booking.carpetCode}</b>
        <StatusBadge status={booking.status} />
      </div>
      <p className="booking-meta">
        {booking.window} · {booking.originSnapshot} · {booking.durationMin}分钟
      </p>
      {myFixes.length > 0 && (
        <p className="fix-line">
          已补固色 {myFixes.length} 次：
          {myFixes.map((f) => (
            <span key={f.id} className="chip">
              {f.agent}
            </span>
          ))}
        </p>
      )}
      <div className="booking-actions">
        {booking.status === "scheduled" && (
          <>
            <button onClick={() => notify(store.startWashing(booking.id))}>
              开始清洗
            </button>
            <button
              className="link-btn danger"
              onClick={() => notify(store.cancelBooking(booking.id))}
            >
              撤回排期
            </button>
          </>
        )}
        {booking.status === "washing" && (
          <>
            <button className="primary" onClick={() => notify(store.completeBooking(booking.id))}>
              标记完工
            </button>
            <button
              className="warn-btn"
              onClick={() => notify(store.suspendForBleeding(booking.id))}
            >
              发现脱色，挂起
            </button>
          </>
        )}
        {booking.status === "suspended" && !showFix && (
          <button className="warn-btn" onClick={() => setShowFix(true)}>
            补做固色登记后继续
          </button>
        )}
        {booking.status === "completed" && (
          <span className="muted">{fmtMin(booking.endMin)} 前已收毯</span>
        )}
      </div>
      {booking.status === "suspended" && showFix && (
        <div className="fix-form">
          <p className="suspend-note">
            池位保留中，完工按钮锁定；登记固色后自动恢复清洗。
          </p>
          <label>
            <span>固色剂 / 固色工艺</span>
            <input
              value={agent}
              placeholder="如：醋酸固色，浸泡20分钟"
              onChange={(e) => setAgent(e.target.value)}
            />
          </label>
          <label>
            <span>处理备注</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="booking-actions">
            <button className="primary" onClick={submitFix}>
              提交固色并恢复
            </button>
            <button className="link-btn" onClick={() => setShowFix(false)}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
