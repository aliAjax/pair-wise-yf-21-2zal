import { useCallback, useState } from "react";
import "./styles.css";
import { useDeskStore, todayISO } from "./business/storage";
import { isOccupying } from "./business/scheduling";
import { RegisterForm } from "./components/RegisterForm";
import { BatchPlanner } from "./components/BatchPlanner";
import { PoolBoard } from "./components/PoolBoard";
import { CarpetList } from "./components/CarpetList";
import { Notice, type NoticeState, type Notify } from "./components/ui";
import type { ActionResult } from "./business/types";

function App() {
  const store = useDeskStore();
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [date, setDate] = useState(todayISO());

  const notify = useCallback<Notify>((result: ActionResult) => {
    setNotice({
      key: Date.now() + Math.random(),
      ok: result.ok,
      message: result.message,
      errors: result.ok ? undefined : result.errors,
    });
  }, []);

  const { carpets, bookings, fixLogs } = store.state;
  const suspended = bookings.filter((b) => b.status === "suspended").length;
  const occupying = bookings.filter((b) => isOccupying(b.status)).length;
  const completed = bookings.filter((b) => b.status === "completed").length;

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62009 · 手工地毯清洗排期台</p>
        <h1>地毯清洗排期台</h1>
        <span>
          登记地毯编号、产地、清洗池与预计时长；同一清洗池同一时段只接待一条地毯。
          批量排期遇压边或超容量整批退回；清洗中脱色即挂起保留池位，补做固色登记后恢复清洗。
        </span>
      </section>

      <Notice key={notice?.key} notice={notice} />

      <section className="metrics">
        <article>
          <small>地毯档案</small>
          <strong>{carpets.length}</strong>
        </article>
        <article>
          <small>占用中池位</small>
          <strong>{occupying}</strong>
        </article>
        <article>
          <small>脱色挂起</small>
          <strong>{suspended}</strong>
        </article>
        <article>
          <small>固色登记 / 已完工</small>
          <strong>
            {fixLogs.length} / {completed}
          </strong>
        </article>
      </section>

      <div className="workspace">
        <RegisterForm store={store} notify={notify} />
      </div>

      <div className="workspace">
        <BatchPlanner
          store={store}
          date={date}
          onDateChange={setDate}
          notify={notify}
        />
      </div>

      <div className="workspace">
        <PoolBoard
          store={store}
          date={date}
          onDateChange={setDate}
          notify={notify}
        />
      </div>

      <div className="workspace">
        <CarpetList store={store} />
      </div>

      <footer className="app-foot">
        <span>数据仅保存在本浏览器 localStorage，刷新不丢失。</span>
        <button
          className="link-btn danger"
          onClick={() => {
            store.resetAll();
            notify({ ok: true, message: "已重置为演示数据" });
          }}
        >
          重置演示数据
        </button>
      </footer>
    </main>
  );
}

export default App;
