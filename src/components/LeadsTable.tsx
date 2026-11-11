"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { CUSTOM_COLUMNS } from "@/lib/columns";

type Lead = {
  id: number;
  name: string | null;
  status_id: number | null;
  pipeline_id: number | null;
  responsible_user_id: number | null;
  phone: string | null;
  created_at_kommo: string | null;
  updated_at_kommo: string | null;
  is_deleted: boolean;
  custom_fields: Record<string, string>;
};

type Col = {
  id: string;
  label: string;
  width: number;
  get: (l: Lead) => string;
  filterable?: boolean;
  sort?: (l: Lead) => string | number;
};

const PAGE = 200;
const TZ = "America/Bahia";
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, hour12: false }) : "";

export default function LeadsTable() {
  const router = useRouter();
  const db = supabaseBrowser();

  const [ready, setReady] = useState(false);
  const [leads, setLeads] = useState<Map<number, Lead>>(new Map());
  const [stages, setStages] = useState<Map<string, string>>(new Map());
  const [users, setUsers] = useState<Map<number, string>>(new Map());
  const [live, setLive] = useState(false);
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<{ id: string; dir: 1 | -1 }>({ id: "created", dir: -1 });
  const [shown, setShown] = useState(PAGE);
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  // ---------- colunas ----------
  const columns: Col[] = useMemo(
    () => [
      { id: "id", label: "ID", width: 100, get: (l) => String(l.id), sort: (l) => l.id },
      {
        id: "created",
        label: "Data da criação do lead",
        width: 190,
        get: (l) => fmtDate(l.created_at_kommo),
        sort: (l) => l.created_at_kommo ?? "",
      },
      { id: "name", label: "Nome do Lead", width: 200, get: (l) => l.name ?? "" },
      { id: "phone", label: "Telefone", width: 140, get: (l) => l.phone ?? "" },
      {
        id: "stage",
        label: "Etapa do funil",
        width: 160,
        get: (l) => stages.get(`${l.pipeline_id}:${l.status_id}`) ?? "",
        filterable: true,
      },
      {
        id: "resp",
        label: "Responsável",
        width: 140,
        get: (l) => (l.responsible_user_id ? (users.get(l.responsible_user_id) ?? "") : ""),
        filterable: true,
      },
      ...CUSTOM_COLUMNS.map<Col>((c) => ({
        id: `cf:${c.field}`,
        label: c.label,
        width: c.width ?? 150,
        get: (l) => l.custom_fields?.[c.field] ?? "",
        filterable: c.filterable,
      })),
      {
        id: "updated",
        label: "Última atualização",
        width: 180,
        get: (l) => fmtDate(l.updated_at_kommo),
        sort: (l) => l.updated_at_kommo ?? "",
      },
    ],
    [stages, users],
  );

  // ---------- auth + carga inicial ----------
  const load = useCallback(async () => {
    const { data } = await db.auth.getSession();
    if (!data.session) {
      router.replace("/login");
      return;
    }
    const [st, us] = await Promise.all([
      db.from("stages").select("id,pipeline_id,name"),
      db.from("kommo_users").select("id,name"),
    ]);
    setStages(new Map((st.data ?? []).map((s) => [`${s.pipeline_id}:${s.id}`, s.name as string])));
    setUsers(new Map((us.data ?? []).map((u) => [u.id, u.name])));

    const map = new Map<number, Lead>();
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await db
        .from("leads")
        .select("id,name,status_id,pipeline_id,responsible_user_id,phone,created_at_kommo,updated_at_kommo,is_deleted,custom_fields")
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

  // ---------- filtro / ordenação ----------
  const all = useMemo(() => [...leads.values()], [leads]);

  const options = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of columns.filter((c) => c.filterable)) {
      o[c.id] = [...new Set(all.map(c.get).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return o;
  }, [all, columns]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const col = columns.find((c) => c.id === sortBy.id) ?? columns[1];
    const sortGet = col.sort ?? col.get;
    return all
      .filter((l) => {
        for (const [id, val] of Object.entries(filters)) {
          if (!val) continue;
          const c = columns.find((c) => c.id === id);
          if (c && !c.get(l).split(", ").includes(val) && c.get(l) !== val) return false;
        }
        if (!q) return true;
        return columns.some((c) => c.get(l).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const x = sortGet(a);
        const y = sortGet(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sortBy.dir;
      });
  }, [all, columns, filters, query, sortBy]);

  useEffect(() => setShown(PAGE), [query, filters, sortBy]);

  const toggleSort = (id: string) =>
    setSortBy((s) => (s.id === id ? { id, dir: (s.dir * -1) as 1 | -1 } : { id, dir: -1 }));

  if (!ready) return <div className="loading">Carregando leads…</div>;

  const hasFilters = query || Object.values(filters).some(Boolean);

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
          <span>{hasFilters ? `de ${all.length.toLocaleString("pt-BR")} leads` : "leads"}</span>
        </div>
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
          placeholder="Buscar por ID, nome, telefone, marca…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {columns
          .filter((c) => c.filterable)
          .map((c) => (
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
    </div>
  );
}
