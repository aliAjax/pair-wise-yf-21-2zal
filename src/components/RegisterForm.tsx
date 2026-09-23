import { useState } from "react";
import { POOLS } from "../business/scheduling";
import type { DeskStore } from "../business/storage";
import type { Notify } from "./ui";

const ORIGIN_SUGGESTIONS = ["波斯", "安纳托利亚", "高加索", "藏毯", "土库曼", "新疆"];

export function RegisterForm({
  store,
  notify,
}: {
  store: DeskStore;
  notify: Notify;
}) {
  const [code, setCode] = useState("");
  const [origin, setOrigin] = useState("");
  const [poolId, setPoolId] = useState(POOLS[0].id);
  const [duration, setDuration] = useState("120");
  const [note, setNote] = useState("");

  const submit = () => {
    const result = store.registerCarpet({
      code,
      origin,
      poolId,
      durationMin: Number(duration),
      note,
    });
    notify(result);
    if (result.ok) {
      setCode("");
      setOrigin("");
      setDuration("120");
      setNote("");
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>地毯档案</p>
          <h2>新地毯登记</h2>
        </div>
        <button className="primary" onClick={submit}>
          保存档案
        </button>
      </div>
      <div className="field-grid">
        <label>
          <span>地毯编号（唯一）</span>
          <input
            value={code}
            placeholder="CAR-092"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          <span>产地</span>
          <input
            value={origin}
            list="origin-suggestions"
            placeholder="如：波斯"
            onChange={(e) => setOrigin(e.target.value)}
          />
          <datalist id="origin-suggestions">
            {ORIGIN_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label>
          <span>指定清洗池</span>
          <select value={poolId} onChange={(e) => setPoolId(e.target.value)}>
            {POOLS.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.name}（{pool.id}）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>预计时长（分钟）</span>
          <input
            type="number"
            min={1}
            step={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
        <label className="field-wide">
          <span>备注（材质 / 破损 / 染色风险）</span>
          <input
            value={note}
            placeholder="如：植物染靛蓝，留意脱色"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
