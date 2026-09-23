import { useMemo, useState, type ChangeEvent } from "react";
import type { Carpet } from "../business/types";
import { filterArchives, sortArchives } from "../business/filtering";
import { formatDateTime } from "../business/format";

interface Props {
  archives: Carpet[];
  busyCarpetIds: ReadonlySet<string>;
  onAdd: (id: string, origin: string) => string | null;
  onRemove: (id: string) => void;
}

const ORIGIN_CHIPS = ["波斯", "安纳托利亚", "高加索", "藏毯", "土库曼"];

export default function ArchivePanel({ archives, busyCarpetIds, onAdd, onRemove }: Props) {
  const [id, setId] = useState("");
  const [origin, setOrigin] = useState("");
  const [keyword, setKeyword] = useState("");
  const [originFilter, setOriginFilter] = useState("all");
  const [formError, setFormError] = useState<string | null>(null);
  const [okHint, setOkHint] = useState<string | null>(null);

  const origins = useMemo(() => {
    const set = new Set(archives.map((a) => a.origin));
    return ["all", ...ORIGIN_CHIPS.filter((o) => set.has(o)), ...[...set].filter((o) => !ORIGIN_CHIPS.includes(o))];
  }, [archives]);

  const visible = useMemo(
    () => sortArchives(filterArchives(archives, { origin: originFilter, keyword })),
    [archives, originFilter, keyword],
  );

  function submit() {
    const cid = id.trim();
    const org = origin.trim();
    if (!cid) return setFormError("请填写地毯编号");
    if (!org) return setFormError("请填写或选择产地");
    const err = onAdd(cid, org);
    if (err) {
      setFormError(err);
      setOkHint(null);
      return;
    }
    setFormError(null);
    setOkHint(`已登记 ${cid}（${org}）`);
    setId("");
    setOrigin("");
  }

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>档案登记</p>
          <h2>地毯档案</h2>
        </div>
        <span className="count-badge">共 {archives.length} 条</span>
      </div>

      <div className="field-grid">
        <label>
          <span>地毯编号</span>
          <input
            value={id}
            placeholder="如 CAR-231"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setId(e.target.value)}
          />
        </label>
        <label>
          <span>产地</span>
          <input
            value={origin}
            placeholder="如 波斯"
            list="origin-list"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOrigin(e.target.value)}
          />
          <datalist id="origin-list">
            {ORIGIN_CHIPS.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="origin-quick">
        {ORIGIN_CHIPS.map((o) => (
          <button key={o} type="button" className="chip" onClick={() => setOrigin(o)}>
            {o}
          </button>
        ))}
      </div>

      {formError && <p className="banner error">{formError}</p>}
      {okHint && <p className="banner success">{okHint}</p>}

      <button type="button" className="primary block" onClick={submit}>
        登记档案
      </button>

      <div className="list-filter">
        <input
          value={keyword}
          placeholder="按编号 / 产地搜索"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setKeyword(e.target.value)}
        />
        <div className="chips small">
          {origins.map((o) => (
            <button
              key={o}
              type="button"
              className={originFilter === o ? "chip active" : "chip"}
              onClick={() => setOriginFilter(o)}
            >
              {o === "all" ? "全部产地" : o}
            </button>
          ))}
        </div>
      </div>

      <div className="records">
        {visible.length === 0 && <p className="empty">暂无符合条件的档案。</p>}
        {visible.map((c) => {
          const busy = busyCarpetIds.has(c.id);
          return (
            <article key={c.id}>
              <b>{c.id.slice(-2)}</b>
              <div className="record-body">
                <h3>
                  {c.id} <span className="tag origin">{c.origin}</span>
                  {busy && <span className="tag muted">已有排期</span>}
                </h3>
                <p>登记于 {formatDateTime(c.createdAt)}</p>
              </div>
              <button
                type="button"
                className="ghost danger-text"
                disabled={busy}
                title={busy ? "该地毯已有排期，不能删除档案" : "删除档案"}
                onClick={() => onRemove(c.id)}
              >
                删除
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
