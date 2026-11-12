"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DEFAULT_BUILTIN_VISIBLE, DEFAULT_CUSTOM_VISIBLE, SELECT_LIKE_TYPES } from "@/lib/columns";
import ColumnSettings, { type ColMeta } from "./ColumnSettings";

type Lead = {
  id: number;
  name: string | null;
  status_id: number | null;
  pipeline_id: number | null;
  responsible_user_id: number | null;
  contact_name: string | null;
  phone: string | null;
  price: number | null;
  tags: string | null;
  created_at_kommo: string | null;
  updated_at_kommo: string | null;
  closed_at: string | null;
  is_deleted: boolean;
  custom_fields: Record<string, string>;
};

type FieldDef = { id: number; name: string; type: string | null; sort: number | null };

type Col = ColMeta & {
  width: number;
  get: (l: Lead) => string;
  filterable?: boolean;
  sort?: (l: Lead) => string | number;
};

const PAGE = 200;
const TZ = "America/Bahia";
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, hour12: false }) : "";
const fmtMoney = (n: number | null) =>
  n ? Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";

export default function LeadsTable() {
  const router = useRouter();
  const db = supabaseBrowser();

  const [ready, setReady] = useState(false);
  const [leads, setLeads] = useState<Map<number, Lead>>(new Map());
  const [stages, setStages] = useState<Map<string, string>>(new Map());
  const [pipelines, setPipelines] = useState<Map<number, string>>(new Map());
  const [users, setUsers] = useState<Map<number, string>>(new Map());
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<{ id: string; dir: 1 | -1 }>({ id: "created", dir: -1 });
  const [shown, setShown] = useState(PAGE);
  // preferências do usuário (null = padrão do sistema)
  const [visibleCols, setVisibleCols] = useState<string[] | null>(null);
  const [hiddenPipes, setHiddenPipes] = useState<number[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const all = useMemo(() => [...leads.values()], [leads]);

  // ---------- catálogo completo de colunas ----------
  const customNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const d of [...fieldDefs].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) {
      if (!seen.has(d.name)) {
        seen.add(d.name);
        names.push(d.name);
      }
    }
    // campos que existem nos leads mas não na lista de definições
    for (const l of all)
      for (const k of Object.keys(l.custom_fields ?? {})) {
        if (!seen.has(k)) {
          seen.add(k);
          names.push(k);
        }
      }
    return names;
  }, [fieldDefs, all]);

  const allColumns: Col[] = useMemo(() => {
    const selectLike = new Set(fieldDefs.filter((d) => SELECT_LIKE_TYPES.includes(d.type ?? "")).map((d) => d.name));
    const base: Col[] = [
      { id: "id", label: "ID", group: "base", width: 100, get: (l) => String(l.id), sort: (l) => l.id },
      {
        id: "created",
        label: "Data da criação do lead",
        group: "base",
        width: 190,
        get: (l) => fmtDate(l.created_at_kommo),
        sort: (l) => l.created_at_kommo ?? "",
      },
      { id: "name", label: "Nome do Lead", group: "base", width: 200, get: (l) => l.name ?? "" },
      { id: "contact", label: "Contato", group: "base", width: 180, get: (l) => l.contact_name ?? "" },
      { id: "phone", label: "Telefone", group: "base", width: 140, get: (l) => l.phone ?? "" },
      {
        id: "pipeline",
        label: "Funil",
        group: "base",
        width: 170,
        get: (l) => (l.pipeline_id ? (pipelines.get(l.pipeline_id) ?? "") : ""),
        filterable: true,
      },
      {
        id: "stage",
        label: "Etapa do funil",
        group: "base",
        width: 160,
        get: (l) => stages.get(`${l.pipeline_id}:${l.status_id}`) ?? "",
        filterable: true,
      },
      {
        id: "resp",
        label: "Responsável",
        group: "base",
        width: 140,
        get: (l) => (l.responsible_user_id ? (users.get(l.responsible_user_id) ?? "") : ""),
        filterable: true,
      },
      {
        id: "price",
        label: "Valor",
        group: "base",
        width: 120,
        get: (l) => fmtMoney(l.price),
        sort: (l) => l.price ?? 0,
      },
      { id: "tags", label: "Tags", group: "base", width: 170, get: (l) => l.tags ?? "" },
      {
        id: "closed",
        label: "Fechado em",
        group: "base",
        width: 180,
        get: (l) => fmtDate(l.closed_at),
        sort: (l) => l.closed_at ?? "",
      },
      {
        id: "updated",
        label: "Última atualização",
        group: "base",
        width: 180,
        get: (l) => fmtDate(l.updated_at_kommo),
        sort: (l) => l.updated_at_kommo ?? "",
      },
    ];
    const custom = customNames.map<Col>((n) => ({
      id: `cf:${n}`,
      label: n,
      group: "campo",
      width: Math.min(280, Math.max(130, n.length * 9 + 40)),
      get: (l) => l.custom_fields?.[n] ?? "",
      filterable: selectLike.has(n),
    }));
    return [...base, ...custom];
  }, [fieldDefs, customNames, pipelines, stages, users]);

  const defaultIds = useMemo(() => {
    const ids = new Set(allColumns.map((c) => c.id));
    return [...DEFAULT_BUILTIN_VISIBLE, ...DEFAULT_CUSTOM_VISIBLE.map((n) => `cf:${n}`)].filter((id) => ids.has(id));
  }, [allColumns]);

  const visibleIds = visibleCols ?? defaultIds;
  const columns = useMemo(() => {
    const set = new Set(visibleIds);
    return allColumns.filter((c) => set.has(c.id));
  }, [allColumns, visibleIds]);

  // ---------- auth + carga inicial ----------
  const load = useCallback(async () => {
    const { data } = await db.auth.getSession();
    if (!data.session) {
      router.replace("/login");
      return;
    }
    const [st, us, fd, cfg] = await Promise.all([
      db.from("stages").select("id,pipeline_id,pipeline_name,name"),
      db.from("kommo_users").select("id,name"),
      db.from("field_defs").select("id,name,type,sort"),
      db.from("user_settings").select("visible_columns,hidden_pipelines").maybeSingle(),
    ]);
    setStages(new Map((st.data ?? []).map((s) => [`${s.pipeline_id}:${s.id}`, s.name as string])));
    setPipelines(new Map((st.data ?? []).map((s) => [s.pipeline_id as number, (s.pipeline_name as string) ?? ""])));
    setUsers(new Map((us.data ?? []).map((u) => [u.id, u.name])));
    setFieldDefs((fd.data ?? []) as FieldDef[]);
    if (cfg.data) {
      setVisibleCols((cfg.data.visible_columns as string[] | null) ?? null);
      setHiddenPipes((cfg.data.hidden_pipelines as number[] | null) ?? []);
    }

    const map = new Map<number, Lead>();
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await db
        .from("leads")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at_kommo", { ascending: false })
        .range(from, from + 999);
      if (error || !rows) break;
      rows.forEach((r) => map.set(r.id, r as Lead));
      if (rows.length < 1000) break;
    }
    setLeads(map);
    setReady(true);
  }, [db, router]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- tempo real ----------
  useEffect(() => {
    if (!ready) return;
    const channel = db
      .channel("leads-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: number }).id;
          setLeads((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          return;
        }
        const row = payload.new as Lead;
        setLeads((prev) => {
          const next = new Map(prev);
          if (row.is_deleted) next.delete(row.id);
          else next.set(row.id, row);
          return next;
        });
        if (!row.is_deleted) {
          setFlash((p) => new Set(p).add(row.id));
          setTimeout(
            () =>
              setFlash((p) => {
                const n = new Set(p);
                n.delete(row.id);
                return n;
              }),
            2500,
          );
        }
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      db.removeChannel(channel);
    };
  }, [ready, db]);

  // ---------- funis ----------
  const pipelineList = useMemo(() => {
    const counts = new Map<number, number>();
    for (const l of all) if (l.pipeline_id) counts.set(l.pipeline_id, (counts.get(l.pipeline_id) ?? 0) + 1);
    const ids = new Set([...pipelines.keys(), ...counts.keys()]);
    return [...ids]
      .map((id) => ({ id, name: pipelines.get(id) || `Funil ${id}`, count: counts.get(id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [pipelines, all]);

  const inScope = useMemo(() => {
    if (!hiddenPipes.length) return all;
    const hid = new Set(hiddenPipes);
    return all.filter((l) => !(l.pipeline_id && hid.has(l.pipeline_id)));
  }, [all, hiddenPipes]);

  // ---------- filtro / ordenação ----------
  const filterCols = useMemo(() => columns.filter((c) => c.filterable), [columns]);

  const options = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of filterCols) {
      const vals = new Set<string>();
      for (const l of inScope) {
        const v = c.get(l);
        if (v) v.split(", ").forEach((x) => vals.add(x)); // multiseleção: cada opção separada
      }
      o[c.id] = [...vals].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return o;
  }, [inScope, filterCols]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const col = allColumns.find((c) => c.id === sortBy.id) ?? allColumns[1];
    const sortGet = col.sort ?? col.get;
    return inScope
      .filter((l) => {
        for (const [id, val] of Object.entries(filters)) {
          if (!val) continue;
          const c = allColumns.find((c) => c.id === id);
          if (c && !c.get(l).split(", ").includes(val)) return false;
        }
        if (!q) return true;
        return columns.some((c) => c.get(l).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const x = sortGet(a);
        const y = sortGet(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sortBy.dir;
      });
  }, [inScope, allColumns, columns, filters, query, sortBy]);

  useEffect(() => setShown(PAGE), [query, filters, sortBy, hiddenPipes]);

  const toggleSort = (id: string) =>
    setSortBy((s) => (s.id === id ? { id, dir: (s.dir * -1) as 1 | -1 } : { id, dir: -1 }));

  async function saveSettings(cols: string[], hidden: number[]): Promise<string | null> {
    setVisibleCols(cols);
    setHiddenPipes(hidden);
    setFilters((f) => Object.fromEntries(Object.entries(f).filter(([id]) => cols.includes(id))));
    const { data: u } = await db.auth.getUser();
    if (!u.user) return "Sessão expirada. Entre novamente.";
    const { error } = await db.from("user_settings").upsert({
      user_id: u.user.id,
      visible_columns: cols,
      hidden_pipelines: hidden,
      updated_at: new Date().toISOString(),
    });
    return error ? "Aplicado nesta tela, mas não foi possível salvar (rode a migração 003 no Supabase)." : null;
  }

  if (!ready) return <div className="loading">Carregando leads…</div>;

  const hasFilters = query || Object.values(filters).some(Boolean);
  const total = inScope.length;

  return (
    <div className="page">
      <header className="bar">
        <div className="title">
          <h1>Leads</h1>
          <span className={`live ${live ? "on" : ""}`}>
            <i /> {live ? "Ao vivo" : "Reconectando…"}
          </span>
        </div>
        <div className="stats">
          <b>{rows.length.toLocaleString("pt-BR")}</b>
          <span>
            {hasFilters ? `de ${total.toLocaleString("pt-BR")} leads` : "leads"}
            {hiddenPipes.length > 0 && ` · ${hiddenPipes.length} funil(is) oculto(s)`}
          </span>
        </div>
        <button className="ghost" onClick={() => setShowSettings(true)}>
          ⚙ Colunas e funis
        </button>
        <button
          className="ghost"
          onClick={async () => {
            await db.auth.signOut();
            router.replace("/login");
          }}
        >
          Sair
        </button>
      </header>

      <div className="filters">
        <input
          className="search"
          placeholder="Buscar nas colunas visíveis…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filterCols.map((c) => (
          <select
            key={c.id}
            value={filters[c.id] ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, [c.id]: e.target.value }))}
            aria-label={c.label}
          >
            <option value="">{c.label}: todos</option>
            {options[c.id]?.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ))}
        {hasFilters && (
          <button
            className="ghost"
            onClick={() => {
              setQuery("");
              setFilters({});
            }}
          >
            Limpar
          </button>
        )}
      </div>

      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="rn" />
              {columns.map((c) => (
                <th key={c.id} style={{ minWidth: c.width }} onClick={() => toggleSort(c.id)}>
                  {c.label}
                  {sortBy.id === c.id && <span className="arrow">{sortBy.dir === 1 ? " ▲" : " ▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((l, i) => (
              <tr key={l.id} className={flash.has(l.id) ? "flash" : ""}>
                <td className="rn">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.id} title={c.get(l)}>
                    {c.get(l)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="empty" colSpan={columns.length + 1}>
                  Nenhum lead encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {shown < rows.length && (
          <div className="more">
            <button onClick={() => setShown((s) => s + PAGE)}>
              Mostrar mais ({(rows.length - shown).toLocaleString("pt-BR")} restantes)
            </button>
          </div>
        )}
      </div>

      {showSettings && (
        <ColumnSettings
          columns={allColumns}
          visible={visibleIds}
          defaults={defaultIds}
          pipelines={pipelineList}
          hidden={hiddenPipes}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
