"use client";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Search,
  Star,
  Folder,
  LayoutGrid,
  List,
  Columns3,
  Copy,
  Pencil,
  Trash2,
  GripVertical,
  Plus,
  Database,
  LayoutDashboard,
  Upload,
  Cloud,
  HardDrive,
} from "lucide-react";
import type { SavedDashboard, Source } from "@/lib/analytics";
import {
  dashboardFolder,
  DEFAULT_FOLDER,
  selectDashboards,
} from "@/lib/dashboard-library";
import { useBoardPointer } from "@/hooks/use-board-pointer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

type Props = {
  dashboards: SavedDashboard[];
  sources: Source[];
  busy: boolean;
  cloud: boolean;
  loaded: boolean;
  onOpen: (d: SavedDashboard) => void;
  onNew: () => void;
  onImport: () => void;
  onDuplicate: (d: SavedDashboard) => void;
  onUpdate: (
    d: SavedDashboard,
    patch: Partial<SavedDashboard>,
  ) => Promise<boolean>;
  onDelete: (d: SavedDashboard) => void;
};
export function DashboardLibrary({
  dashboards,
  sources,
  busy,
  cloud,
  loaded,
  onOpen,
  onNew,
  onImport,
  onDuplicate,
  onUpdate,
  onDelete,
}: Props) {
  const [view, setView] = useState<"cards" | "list" | "board">("cards");
  const [query, setQuery] = useState(""),
    [folder, setFolder] = useState(""),
    [starred, setStarred] = useState(false),
    [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState<SavedDashboard | null>(null),
    [name, setName] = useState(""),
    [destination, setDestination] = useState("");
  const folders = useMemo(
    () =>
      [...new Set([DEFAULT_FOLDER, ...dashboards.map(dashboardFolder)])].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [dashboards],
  );
  const filtered = useMemo(
    () => selectDashboards(dashboards, query, folder, starred, sort),
    [dashboards, query, folder, starred, sort],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24)),
    activePage = Math.min(page, pages);
  const shown = filtered.slice((activePage - 1) * 24, activePage * 24);
  const drag = useBoardPointer((id, target) => {
    const d = dashboards.find((d) => d.id === id);
    if (d && !busy && dashboardFolder(d) !== target)
      void onUpdate(d, { folder: target === DEFAULT_FOLDER ? "" : target });
  }, "[data-folder-drop]");
  function organize(d: SavedDashboard) {
    setEdit(d);
    setName(d.config.title);
    setDestination(d.folder || "");
  }
  function pickFolder(value: string) {
    setFolder(value);
    setPage(1);
  }
  const tile = (d: SavedDashboard) => {
    const source = sources.find((s) => s.id === d.sourceId);
    const visuals = d.config.visuals;
    return (
      <article
        className={`desk-card ${drag.state?.id === d.id ? "desk-dragging" : ""}`}
        key={d.id}
      >
        <div className="desk-card-top">
          <button
            className="desk-grip"
            aria-label={`Arrastar ${d.config.title} para uma pasta`}
            title="Arraste para uma pasta; ou use Organizar"
            disabled={busy}
            {...drag.handle(d.id)}
          >
            <GripVertical size={17} />
          </button>
          <span>{dashboardFolder(d)}</span>
          <button
            className={`desk-star ${d.starred ? "is-starred" : ""}`}
            aria-label={`${d.starred ? "Desfavoritar" : "Favoritar"} ${d.config.title}`}
            aria-pressed={!!d.starred}
            disabled={busy}
            onClick={() => void onUpdate(d, { starred: !d.starred })}
          >
            <Star size={17} fill={d.starred ? "currentColor" : "none"} />
          </button>
        </div>
        <button className="desk-card-open" onClick={() => onOpen(d)}>
          <div
            className="desk-thumbnail"
            aria-hidden="true"
            style={
              {
                "--preview-accent": d.config.appearance?.accent || "#0b9b72",
              } as React.CSSProperties
            }
          >
            {(
              visuals ?? [
                { type: "kpi", span: 4 },
                { type: "kpi", span: 4 },
                { type: "kpi", span: 4 },
                { type: "area", span: 8 },
                { type: "donut", span: 4 },
              ]
            )
              .slice(0, 8)
              .map((v, i) => (
                <span key={i} style={{ gridColumn: `span ${v.span}` }}>
                  {v.type === "kpi" ? (
                    <i className="thumb-kpi" />
                  ) : v.type === "donut" ? (
                    <i className="thumb-donut" />
                  ) : v.type === "text" ? (
                    <i className="thumb-text" />
                  ) : (
                    <svg viewBox="0 0 100 35" preserveAspectRatio="none">
                      <path
                        d={
                          ["line", "area"].includes(v.type)
                            ? "M0 30 L15 25 L28 28 L40 12 L55 18 L68 8 L80 14 L100 2"
                            : "M10 35 V17 M30 35 V5 M50 35 V24 M70 35 V10 M90 35 V3"
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={["line", "area"].includes(v.type) ? 3 : 10}
                      />
                    </svg>
                  )}
                </span>
              ))}
            {visuals?.length === 0 && <small>Painel em branco</small>}
          </div>
          <div className="desk-card-title">
            <h2>{d.config.title}</h2>
            <ArrowRight size={18} />
          </div>
          <p>{source?.name || "Fonte indisponível"}</p>
        </button>
        <div className="desk-card-bottom">
          <span>
            {new Date(d.updatedAt).toLocaleDateString("pt-BR")} ·{" "}
            {visuals?.length ?? 5} visuais
          </span>
          <div>
            <button
              aria-label={`Organizar ${d.config.title}`}
              title="Renomear e mover"
              disabled={busy}
              onClick={() => organize(d)}
            >
              <Pencil size={15} />
            </button>
            <button
              aria-label={`Duplicar ${d.config.title}`}
              title="Duplicar dashboard"
              disabled={busy}
              onClick={() => onDuplicate(d)}
            >
              <Copy size={15} />
            </button>
            <button
              aria-label={`Excluir ${d.config.title}`}
              title="Excluir"
              disabled={busy}
              onClick={() => onDelete(d)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </article>
    );
  };
  return (
    <section className="desk">
      <div className="desk-overview">
        <div className="desk-welcome">
          <span className="eyebrow">DO DADO À DECISÃO</span>
          <h2>Um espaço para cada pergunta.</h2>
          <p>
            Crie painéis independentes, organize suas análises e explore os
            dados do seu jeito.
          </p>
          <button className="text-button" onClick={onImport}>
            <Upload size={16} /> Começar com uma planilha{" "}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="desk-stat">
          <LayoutDashboard size={20} />
          <strong>{dashboards.length}</strong>
          <span>Dashboards</span>
        </div>
        <div className="desk-stat">
          <Database size={20} />
          <strong>{sources.filter((s) => !s.demo).length}</strong>
          <span>Fontes conectadas</span>
        </div>
        <div className="desk-stat">
          <Star size={20} />
          <strong>{dashboards.filter((d) => d.starred).length}</strong>
          <span>Favoritos</span>
        </div>
      </div>
      <div className="desk-layout">
        <aside className="desk-sidebar" aria-label="Pastas de dashboards">
          <span className="desk-label">BIBLIOTECA</span>
          <button
            className={!folder && !starred ? "active" : ""}
            onClick={() => {
              pickFolder("");
              setStarred(false);
            }}
          >
            <LayoutGrid size={16} /> Todos os painéis <b>{dashboards.length}</b>
          </button>
          <button
            className={starred ? "active" : ""}
            onClick={() => {
              setStarred(!starred);
              pickFolder("");
            }}
          >
            <Star size={16} /> Favoritos
          </button>
          <span className="desk-label">PASTAS · ARRASTE PARA MOVER</span>
          {folders.map((f) => (
            <button
              key={f}
              data-folder-drop
              data-drop-id={f}
              className={`${folder === f ? "active" : ""} ${drag.state?.target === f ? "desk-drop" : ""}`}
              onClick={() => pickFolder(f)}
            >
              <Folder size={16} />
              <span>{f}</span>
              <b>{dashboards.filter((d) => dashboardFolder(d) === f).length}</b>
            </button>
          ))}
          <p className="desk-folder-help">
            Crie uma pasta em “Organizar” de qualquer dashboard.
          </p>
          <div className="desk-storage">
            {cloud ? <Cloud size={17} /> : <HardDrive size={17} />}
            <span>
              {cloud ? "Salvo na sua conta" : "Salvo neste navegador"}
            </span>
          </div>
        </aside>
        <div className="desk-main">
          <div className="desk-controls">
            <label className="desk-search">
              <Search size={17} />
              <input
                aria-label="Buscar dashboards"
                placeholder="Buscar nome ou pasta…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <select
              aria-label="Ordenar dashboards"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="recent">Mais recentes</option>
              <option value="name">Nome A–Z</option>
              <option value="oldest">Mais antigos</option>
            </select>
            <div
              className="desk-view-switch"
              role="group"
              aria-label="Visão da biblioteca"
            >
              {(
                [
                  { id: "cards", label: "Cartões", Icon: LayoutGrid },
                  { id: "list", label: "Lista", Icon: List },
                  { id: "board", label: "Quadro por pasta", Icon: Columns3 },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  aria-label={label}
                  title={label}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
          </div>
          <div className="desk-results">
            <strong>
              {starred ? "Favoritos" : folder || "Todos os dashboards"}
            </strong>
            <span>
              {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
          {!loaded ? (
            <div className="empty-state" role="status">
              Carregando suas análises…
            </div>
          ) : !filtered.length ? (
            <div className="desk-empty">
              <LayoutDashboard size={38} />
              <h2>
                {dashboards.length
                  ? "Nenhum painel encontrado"
                  : "Sua próxima decisão começa aqui"}
              </h2>
              <p>
                {dashboards.length
                  ? "Tente outro nome, pasta ou filtro."
                  : "Comece em branco ou use um modelo com seus próprios dados."}
              </p>
              <button
                className="primary-button"
                onClick={onNew}
                disabled={busy}
              >
                <Plus size={17} /> Novo dashboard
              </button>
            </div>
          ) : view === "board" ? (
            <div className="desk-board" aria-label="Dashboards por pasta">
              {folders
                .filter((f) => !folder || f === folder)
                .map((f) => (
                  <section
                    key={f}
                    data-folder-drop
                    data-drop-id={f}
                    className={`desk-column ${drag.state?.target === f ? "desk-drop" : ""}`}
                  >
                    <header>
                      <Folder size={15} />
                      {f}
                      <b>
                        {
                          filtered.filter((d) => dashboardFolder(d) === f)
                            .length
                        }
                      </b>
                    </header>
                    {shown.filter((d) => dashboardFolder(d) === f).map(tile)}
                    <p className="desk-drop-hint">Solte um painel aqui</p>
                  </section>
                ))}
            </div>
          ) : (
            <div className={`desk-items ${view}`}>{shown.map(tile)}</div>
          )}
          {pages > 1 && (
            <nav className="desk-pagination" aria-label="Páginas de dashboards">
              <button
                disabled={activePage === 1}
                onClick={() => setPage(activePage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {activePage} de {pages}
              </span>
              <button
                disabled={activePage === pages}
                onClick={() => setPage(activePage + 1)}
              >
                Próxima
              </button>
            </nav>
          )}
          <p className="desk-footnote">
            Miniaturas representam a composição do painel. Abra uma análise para
            ver os valores atualizados.
          </p>
        </div>
      </div>
      <div className="sr-only" role="status">
        {drag.state
          ? `Movendo dashboard. ${drag.state.target ? `Destino: ${drag.state.target}` : "Escolha uma pasta"}`
          : ""}
      </div>
      <Dialog
        open={!!edit}
        onOpenChange={(open) => !open && !busy && setEdit(null)}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Organizar dashboard</DialogTitle>
            <DialogDescription>
              Altere o nome e escolha uma pasta existente ou crie uma nova.
            </DialogDescription>
          </DialogHeader>
          <form
            className="desk-organize"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                edit &&
                name.trim() &&
                (await onUpdate(edit, {
                  config: { ...edit.config, title: name.trim() },
                  folder: destination.trim(),
                }))
              )
                setEdit(null);
            }}
          >
            <label>
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={300}
              />
            </label>
            <label>
              Pasta
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                list="dashboard-folders"
                placeholder="Sem pasta"
                maxLength={80}
              />
            </label>
            <datalist id="dashboard-folders">
              {folders
                .filter((f) => f !== DEFAULT_FOLDER)
                .map((f) => (
                  <option key={f} value={f} />
                ))}
            </datalist>
            <button className="primary-button" disabled={busy || !name.trim()}>
              Salvar organização
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
