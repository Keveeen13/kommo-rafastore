"use client";

import { useMemo, useState } from "react";

export type ColMeta = { id: string; label: string; group: "base" | "campo" };
export type PipelineMeta = { id: number; name: string; count: number };

type Props = {
  columns: ColMeta[];
  visible: string[];
  defaults: string[];
  pipelines: PipelineMeta[];
  hidden: number[];
  /** devolve mensagem de erro (ou null se salvou) */
  onSave: (cols: string[], hiddenPipelines: number[]) => Promise<string | null>;
  onClose: () => void;
};

export default function ColumnSettings({ columns, visible, defaults, pipelines, hidden, onSave, onClose }: Props) {
  const [sel, setSel] = useState(new Set(visible));
  const [hid, setHid] = useState(new Set(hidden));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return columns.filter((c) => !t || c.label.toLowerCase().includes(t));
  }, [columns, q]);

  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    setter(n);
  };

  async function save() {
    if (sel.size === 0) return setErr("Escolha pelo menos uma coluna.");
    setBusy(true);
    setErr("");
    const e = await onSave(
      columns.filter((c) => sel.has(c.id)).map((c) => c.id),
      [...hid],
    );
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  }

  const groupBlock = (title: string, group: ColMeta["group"]) => {
    const items = shown.filter((c) => c.group === group);
    if (!items.length) return null;
    return (
      <>
        <h4>{title}</h4>
        <div className="chk-grid">
          {items.map((c) => (
            <label key={c.id} className="chk">
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(sel, c.id, setSel)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Colunas e funis">
        <div className="modal-head">
          <h2>Colunas e funis</h2>
          <button className="ghost" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <section>
            <h3>Funis exibidos</h3>
            <p className="hint">Desmarque os funis cujos leads você não quer ver.</p>
            <div className="chk-grid">
              {pipelines.map((p) => (
                <label key={p.id} className="chk">
                  <input type="checkbox" checked={!hid.has(p.id)} onChange={() => toggle(hid, p.id, setHid)} />
                  <span>
                    {p.name} <em>({p.count.toLocaleString("pt-BR")})</em>
                  </span>
                </label>
              ))}
              {pipelines.length === 0 && <span className="hint">Nenhum funil carregado ainda.</span>}
            </div>
          </section>

          <section>
            <h3>
              Colunas <em>({sel.size} de {columns.length})</em>
            </h3>
            <div className="col-tools">
              <input placeholder="Buscar campo…" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="ghost" onClick={() => setSel(new Set(columns.map((c) => c.id)))}>
                Marcar todas
              </button>
              <button className="ghost" onClick={() => setSel(new Set())}>
                Limpar
              </button>
              <button className="ghost" onClick={() => setSel(new Set(defaults))}>
                Padrão
              </button>
            </div>
            {groupBlock("Dados do lead", "base")}
            {groupBlock("Campos personalizados da Kommo", "campo")}
          </section>
        </div>

        <div className="modal-foot">
          {err && <span className="err">{err}</span>}
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
