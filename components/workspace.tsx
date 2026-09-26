"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  FileSpreadsheet,
  HardDrive,
  Layers,
  LayoutDashboard,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  GitMerge,
  X,
  Cloud,
  UserRound,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import {
  Choice,
  DataPreview,
  downloadFile,
} from "@/components/analytics-studio";
import { SmartImport } from "@/components/smart-import";
import { CombineSources } from "@/components/combine-sources";
import { VisualEditor as AnalyticsStudio } from "@/components/visual-editor";
import {
  DEMO,
  analytics,
  defaultConfig,
  formatValue,
  toCSV,
  type Config,
  type Source,
  type SavedDashboard,
} from "@/lib/analytics";
import { type Workspace as LocalWorkspace } from "@/lib/local-workspace";
import {
  localPersistence,
  type Persistence,
  type Account,
} from "@/lib/cloud-workspace";

type View = "studio" | "library" | "sources";
const initial: LocalWorkspace = { version: 1, sources: [], dashboards: [] };
function Nav({
  view,
  onNavigate,
  onHelp,
  account,
  onAccount,
}: {
  view: View;
  onNavigate: (v: View) => void;
  onHelp: () => void;
  account: Account | null;
  onAccount: () => void;
}) {
  return (
    <header className="product-navigation">
      <button
        className="product-brand"
        onClick={() => onNavigate("studio")}
        aria-label="DriveData Assist, início"
      >
        <span className="product-mark">
          <BarChart3 size={25} strokeWidth={2.5} />
        </span>
        <span>
          drivedata<span className="product-brand-label">ASSIST</span>
        </span>
      </button>
      <nav className="product-nav-links" aria-label="Navegação principal">
        {[
          { icon: LayoutDashboard, label: "Estúdio", id: "studio" },
          { icon: Layers, label: "Dashboards", id: "library" },
          { icon: Database, label: "Dados", id: "sources" },
        ].map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onNavigate(id as View)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="product-nav-meta">
        <button
          className="account-button"
          onClick={onAccount}
          aria-label={account ? "Minha conta" : "Entrar ou criar conta"}
        >
          {account ? <Cloud size={16} /> : <UserRound size={16} />}
          <span>{account ? account.name : "Entrar"}</span>
        </button>
        <button
          className="product-help"
          onClick={onHelp}
          aria-label="Como funciona"
        >
          <CircleHelp size={19} />
        </button>
        <span className="product-avatar" aria-label="DriveData">
          DD
        </span>
      </div>
    </header>
  );
}
function MiniChart({ source, config }: { source: Source; config: Config }) {
  const values = analytics(source, { ...config, chart: "area" })
    .series.filter(
      (_, i) => i % Math.max(1, Math.floor(source.rows.length / 60)) === 0,
    )
    .slice(0, 18)
    .map((r) => r.value);
  const max = Math.max(1, ...values.map(Math.abs));
  return (
    <div className="mini-chart" aria-hidden="true">
      {values.map((v, i) => (
        <i
          key={i}
          style={{
            height: `${Math.max(5, (Math.abs(v) / max) * 100)}%`,
            opacity: 0.4 + (i / values.length) * 0.6,
          }}
        />
      ))}
    </div>
  );
}

export default function Workspace({
  storage = localPersistence,
  account = null,
  onAccount = () => {},
}: {
  storage?: Persistence;
  account?: Account | null;
  onAccount?: () => void;
}) {
  const [view, setView] = useState<View>("studio"),
    [workspace, setWorkspace] = useState<LocalWorkspace>(initial);
  const [source, setSource] = useState<Source>(DEMO),
    [config, setConfig] = useState<Config>(() => defaultConfig(DEMO));
  const [currentId, setCurrentId] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [draftKey, setDraftKey] = useState(0);
  const [loaded, setLoaded] = useState(false),
    [storageError, setStorageError] = useState(false),
    [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [modal, setModal] = useState<
    "new" | "save" | "import" | "help" | "source" | null
  >(null);
  const [title, setTitle] = useState(""),
    [newSource, setNewSource] = useState(DEMO.id);
  const [inspected, setInspected] = useState<Source>(DEMO);
  const [remove, setRemove] = useState<{
    type: "dashboard" | "source";
    id: string;
    name: string;
  } | null>(null);
  const [discard, setDiscard] = useState(false),
    pending = useRef<(() => void) | null>(null);
  const [combineOpen, setCombineOpen] = useState(false);

  const sources = [DEMO, ...workspace.sources];
  const changed = useCallback((next: Config) => {
    setConfig(next);
    setDirty(true);
  }, []);
  useEffect(() => {
    let live = true;
    storage
      .load()
      .then((w) => {
        if (live) setWorkspace(w);
      })
      .catch((error) => {
        if (live) {
          setStorageError(true);
          toast.error(
            error instanceof Error
              ? error.message
              : "Não foi possível abrir o workspace. Você pode explorar a demonstração.",
          );
        }
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [storage]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function persist(next: LocalWorkspace) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      if (storageError || !loaded)
        throw new Error(
          "Recarregue o workspace antes de salvar para preservar seus dados.",
        );
      await storage.save(next);
      setWorkspace(next);
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Tente novamente.",
      );
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function switchDraft(
    nextSource: Source,
    nextConfig: Config,
    id: string | null = null,
  ) {
    setSource(nextSource);
    setConfig(nextConfig);
    setCurrentId(id);
    setDirty(!id);
    setDraftKey((k) => k + 1);
    setView("studio");
  }
  function guard(action: () => void) {
    if (dirty) {
      pending.current = action;
      setDiscard(true);
    } else action();
  }
  function openNew() {
    setTitle("");
    setNewSource(source.id);
    setModal("new");
  }
  function openSave() {
    setTitle(config.title);
    setModal("save");
  }
  function openImport() {
    setModal("import");
  }
  async function saveDashboard() {
    const name = title.trim();
    if (!name) return;
    const id = currentId || crypto.randomUUID();
    const saved: SavedDashboard = {
      id,
      sourceId: source.id,
      config: { ...config, title: name },
      updatedAt: new Date().toISOString(),
    };
    const next = {
      ...workspace,
      dashboards: [saved, ...workspace.dashboards.filter((d) => d.id !== id)],
    };
    if (await persist(next)) {
      setCurrentId(id);
      setConfig(saved.config);
      setDirty(false);
      setModal(null);
      toast.success(
        storage.cloud
          ? "Dashboard salvo na sua conta."
          : "Dashboard salvo neste navegador.",
      );
    }
  }
  async function deleteItem() {
    if (!remove) return;
    if (
      remove.type === "source" &&
      workspace.dashboards.some((d) => d.sourceId === remove.id)
    ) {
      toast.error(
        "Essa fonte está vinculada a um dashboard. Exclua os dashboards vinculados primeiro.",
      );
      setRemove(null);
      return;
    }
    const next =
      remove.type === "source"
        ? {
            ...workspace,
            sources: workspace.sources.filter((s) => s.id !== remove.id),
          }
        : {
            ...workspace,
            dashboards: workspace.dashboards.filter((d) => d.id !== remove.id),
          };
    if (await persist(next)) {
      if (remove.id === currentId) {
        setCurrentId(null);
        setDirty(true);
      }
      if (remove.id === source.id) {
        setSource(DEMO);
        setConfig(defaultConfig(DEMO));
        setCurrentId(null);
        setDirty(false);
        setDraftKey((k) => k + 1);
      }
      setRemove(null);
      toast.success("Item removido do workspace.");
    }
  }

  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: "read_dashboard_summary",
        description:
          "Read the current DriveData dashboard configuration and calculated totals. Does not save or share anything.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => {
          const { boardRows, initialVisuals } = await import(
            "@/lib/visual-builder"
          );
          const { prepareSource } = await import("@/lib/data-model");
          const { chartData } = await import("@/lib/chart-model");
          const prepared = prepareSource(source, config.dataSteps);
          const rows = boardRows(prepared.source, config);
          const d = analytics(
            { ...prepared.source, rows },
            { ...config, period: "all" },
          );
          return {
            title: config.title,
            source: source.name,
            demo: source.demo,
            config,
            records: d.rows.length,
            total: d.total,
            average: d.average,
            preparation: {
              steps: prepared.reports,
              columns: prepared.source.columns,
              error: prepared.error,
            },
            visuals: initialVisuals(prepared.source, config).map((visual) => {
              const data = chartData(rows, prepared.source, visual);
              return {
                visual,
                data: {
                  value: data.value,
                  records: data.rows.length,
                  groups: data.data,
                  series: data.series,
                },
              };
            }),
          };
        },
      },
      {
        name: "configure_dashboard",
        description:
          "Stage changes to the current dashboard using supported guided commands. Does not save, publish, upload, or share data.",
        inputSchema: {
          type: "object",
          properties: {
            request: { type: "string", minLength: 1, maxLength: 1200 },
          },
          required: ["request"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input) => {
          if (
            !input ||
            typeof input !== "object" ||
            Object.keys(input).some((k) => k !== "request")
          )
            throw new Error("Expected only a request string.");
          const text = (input as { request?: unknown }).request;
          if (typeof text !== "string" || !text.trim() || text.length > 1200)
            throw new Error("Request must contain 1–1200 characters.");
          const { requestVisual } = await import("@/lib/visual-builder");
          const { prepareSource } = await import("@/lib/data-model");
          const result = requestVisual(
            text,
            prepareSource(source, config.dataSteps).source,
            config,
            crypto.randomUUID(),
          );
          if (!result.changed) throw new Error(result.message);
          changed(result.config);
          setView("studio");
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          return { staged: true, saved: false, config: result.config };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [source, config, changed]);

  const heading =
    view === "studio"
      ? config.title
      : view === "library"
        ? "Meus dashboards"
        : "Fontes de dados";
  return (
    <div className="product-shell">
      <Nav
        view={view}
        onNavigate={setView}
        onHelp={() => setModal("help")}
        account={account}
        onAccount={() => guard(onAccount)}
      />
      <main className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{view === "studio" ? "Visão geral" : heading}</strong>
          </div>
          <button className="version-badge" onClick={() => setModal("help")}>
            PRÉVIA DO PRODUTO
          </button>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "studio"
                  ? "SEUS DADOS, NOVAS PERSPECTIVAS"
                  : "SEU WORKSPACE DRIVEDATA"}
              </div>
              <h1>{heading}</h1>
              <p>
                {view === "studio"
                  ? "Modele seus dados. Crie seus gráficos. Encontre suas respostas."
                  : view === "library"
                    ? "Suas análises organizadas. Prontas para o próximo passo."
                    : "Traga sua planilha como ela está. Organize e conecte os dados aqui."}
              </p>
            </div>
            <div className="heading-actions">
              {view === "sources" && (
                <button
                  className="secondary-button"
                  disabled={!loaded || busy || storageError}
                  onClick={() => setCombineOpen(true)}
                >
                  <GitMerge size={16} />
                  Combinar bases
                </button>
              )}
              {view === "studio" && (
                <button
                  className="secondary-button"
                  onClick={openSave}
                  disabled={!loaded || busy || storageError}
                >
                  <Save size={16} /> Salvar
                </button>
              )}
              <button
                className="primary-button"
                disabled={!loaded || busy}
                onClick={view === "sources" ? openImport : openNew}
              >
                <Plus size={17} />
                {view === "sources" ? "Importar planilha" : "Novo dashboard"}
              </button>
            </div>
          </div>
          {storageError && (
            <div className="inline-error" role="alert">
              O armazenamento está indisponível. A demonstração continua
              disponível; seus dados ainda não podem ser salvos.
            </div>
          )}
          {view === "studio" && (
            <>
              <div className="draft-status">
                {dirty ? (
                  <>
                    <span className="draft-dot" /> Rascunho · alterações não
                    salvas
                  </>
                ) : currentId ? (
                  <>
                    <Check size={13} />{" "}
                    {storage.cloud
                      ? "Salvo na sua conta"
                      : "Salvo neste navegador"}
                  </>
                ) : (
                  <>
                    <Sparkles size={13} /> Explore a demonstração ou importe
                    seus dados
                  </>
                )}
              </div>
              <AnalyticsStudio
                key={`${source.id}-${draftKey}`}
                source={source}
                config={config}
                onChange={changed}
              />
            </>
          )}
          {view === "library" && (
            <>
              <div className="section-toolbar">
                <span>
                  {workspace.dashboards.length}{" "}
                  {workspace.dashboards.length === 1
                    ? "dashboard salvo"
                    : "dashboards salvos"}
                </span>
                <span>
                  {storage.cloud ? (
                    <Cloud size={14} />
                  ) : (
                    <HardDrive size={14} />
                  )}{" "}
                  {storage.cloud ? "Na sua conta" : "Neste navegador"}
                </span>
              </div>
              {!loaded ? (
                <div className="empty-state">
                  <Loader2 className="spin" />
                  Carregando suas análises…
                </div>
              ) : workspace.dashboards.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Layers size={30} />
                  </span>
                  <h2>Seu primeiro dashboard começa aqui.</h2>
                  <p>
                    Explore a base de exemplo ou importe uma planilha.
                    <br />
                    Salve a análise para encontrá-la neste espaço.
                  </p>
                  <button className="primary-button" onClick={openNew}>
                    <Plus size={17} /> Criar meu primeiro dashboard
                  </button>
                </div>
              ) : (
                <div className="library-grid">
                  {workspace.dashboards.map((d) => {
                    const s = sources.find((s) => s.id === d.sourceId);
                    if (!s) return null;
                    return (
                      <article className="dashboard-tile" key={d.id}>
                        <button
                          className="tile-open"
                          onClick={() =>
                            guard(() => switchDraft(s, d.config, d.id))
                          }
                        >
                          <div className="tile-badge">
                            <BarChart3 size={17} />
                            <span>
                              {s.demo ? "DEMONSTRAÇÃO" : "DADOS LOCAIS"}
                            </span>
                            <ArrowRight size={16} />
                          </div>
                          <MiniChart source={s} config={d.config} />
                          <h2>{d.config.title}</h2>
                          <p>{s.name}</p>
                        </button>
                        <div className="tile-footer">
                          <span>
                            {new Intl.DateTimeFormat("pt-BR", {
                              dateStyle: "short",
                            }).format(new Date(d.updatedAt))}{" "}
                            · {s.rows.length} registros
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Excluir ${d.config.title}`}
                            onClick={() =>
                              setRemove({
                                type: "dashboard",
                                id: d.id,
                                name: d.config.title,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="local-note">
                <HardDrive size={18} />
                <p>
                  {storage.cloud
                    ? "Os dashboards e suas fontes ficam salvos na sua conta. Entre em outro dispositivo para continuar suas análises."
                    : "Os dashboards e suas fontes ficam neste navegador. Entre ou crie uma conta para salvar na nuvem."}
                </p>
              </div>
            </>
          )}
          {view === "sources" && (
            <>
              <div className="import-banner">
                <span className="import-icon">
                  <FileSpreadsheet size={28} />
                </span>
                <div>
                  <h2>Uma planilha. Muitas respostas.</h2>
                  <p>
                    Importe Excel ou CSV, revise a estrutura encontrada e
                    prepare seus dados. Até 10 MB e 20 mil registros na base
                    final.
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() =>
                    downloadFile(
                      "exemplo-vendas-drivedata.csv",
                      toCSV(DEMO),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  Baixar exemplo
                </button>
              </div>
              <div className="source-list">
                {sources.map((s) => (
                  <article className="source-row" key={s.id}>
                    <span className={`source-icon ${s.demo ? "demo" : ""}`}>
                      {s.demo ? (
                        <Database size={23} />
                      ) : (
                        <FileSpreadsheet size={23} />
                      )}
                    </span>
                    <div className="source-info">
                      <h2>{s.name}</h2>
                      <p>
                        {s.rows.length.toLocaleString("pt-BR")} registros ·{" "}
                        {s.columns.length} colunas{" "}
                        <span>
                          ·{" "}
                          {s.demo
                            ? "Demonstração"
                            : storage.cloud
                              ? "Na sua conta"
                              : "Base local"}
                        </span>
                      </p>
                    </div>
                    <div className="source-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          setInspected(s);
                          setModal("source");
                        }}
                      >
                        Ver dados
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          guard(() => switchDraft(s, defaultConfig(s)))
                        }
                      >
                        Analisar <ArrowRight size={15} />
                      </button>
                      {!s.demo && (
                        <button
                          className="icon-button"
                          aria-label={`Excluir fonte ${s.name}`}
                          onClick={() =>
                            setRemove({
                              type: "source",
                              id: s.id,
                              name: s.name,
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="local-note">
                <HardDrive size={18} />
                <p>
                  {storage.cloud
                    ? "A interpretação acontece no seu dispositivo. Ao confirmar, os dados organizados são salvos no workspace privado da sua conta."
                    : "Os arquivos são lidos no seu dispositivo e salvos neste navegador. Entre na sua conta para salvar dados organizados na nuvem."}
                </p>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>DriveData Assist</span>
            <span>Transforme dados em próximos passos.</span>
          </footer>
        </div>
      </main>
      <Toaster position="bottom-right" richColors closeButton />
      {combineOpen && (
        <CombineSources
          sources={sources}
          onClose={() => setCombineOpen(false)}
          onSave={async (combined) => {
            const saved = await persist({
              ...workspace,
              sources: [...workspace.sources, combined],
            });
            if (saved)
              toast.success(
                "Nova base criada. Disponível para criar dashboards.",
              );
            return saved;
          }}
        />
      )}
      <Dialog
        open={modal === "new"}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Vamos criar seu dashboard</DialogTitle>
            <DialogDescription>
              Dê um nome à sua análise e escolha os dados para começar.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const s = sources.find((s) => s.id === newSource);
              if (!s || !title.trim()) return;
              setModal(null);
              guard(() =>
                switchDraft(s, { ...defaultConfig(s), title: title.trim() }),
              );
            }}
          >
            <div className="form-fields">
              <label htmlFor="dashboard-name">
                Nome do dashboard
                <Input
                  id="dashboard-name"
                  placeholder="Ex.: Acompanhamento comercial"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label>
                Fonte de dados
                <Choice
                  label="Fonte de dados"
                  value={newSource}
                  onChange={setNewSource}
                  items={sources.map((s) => ({ value: s.id, label: s.name }))}
                />
              </label>
            </div>
            <button
              type="button"
              className="text-button import-link"
              onClick={openImport}
            >
              <Upload size={15} /> Importar outra planilha
            </button>
            <button
              className="primary-button full-button"
              disabled={!title.trim()}
              type="submit"
            >
              <Sparkles size={16} /> Criar dashboard
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "save"}
        onOpenChange={(v) => {
          if (!v && !busy) setModal(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Salvar dashboard</DialogTitle>
            <DialogDescription>
              {storage.cloud
                ? "O painel e a fonte ficam disponíveis na sua conta, em Meus dashboards."
                : "O painel e a fonte ficam disponíveis em Meus dashboards neste navegador."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveDashboard();
            }}
          >
            <div className="form-fields">
              <label htmlFor="save-name">
                Nome do dashboard
                <Input
                  id="save-name"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </label>
            </div>
            <button
              className="primary-button full-button"
              type="submit"
              disabled={!title.trim() || busy}
            >
              {busy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Save size={16} />
              )}{" "}
              Salvar dashboard
            </button>
          </form>
        </DialogContent>
      </Dialog>
      {modal === "import" && (
        <SmartImport
          cloud={storage.cloud}
          onClose={() => setModal(null)}
          onImport={async (imported) => {
            if (
              await persist({
                ...workspace,
                sources: [...workspace.sources, imported],
              })
            ) {
              toast.success(
                `${imported.rows.length} registros prontos para analisar.`,
              );
              setModal(null);
              guard(() => switchDraft(imported, defaultConfig(imported)));
              return true;
            }
            return false;
          }}
        />
      )}
      <Dialog
        open={modal === "source"}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
      >
        <DialogContent className="app-dialog wide-dialog">
          <DialogHeader>
            <DialogTitle>{inspected.name}</DialogTitle>
            <DialogDescription>
              {inspected.demo
                ? "Dados fictícios para explorar a plataforma."
                : storage.cloud
                  ? "Dados importados e armazenados na sua conta."
                  : "Dados importados e armazenados neste navegador."}
            </DialogDescription>
          </DialogHeader>
          <div className="column-tags">
            {inspected.columns.map((c) => (
              <span key={c}>
                {inspected.numeric.includes(c)
                  ? "#"
                  : inspected.dates.includes(c)
                    ? "◷"
                    : "Aa"}{" "}
                {c}
              </span>
            ))}
          </div>
          {inspected.importNotes && (
            <div className="source-provenance">
              <strong>
                Origem: {inspected.importNotes.file} ·{" "}
                {inspected.importNotes.sheet}
              </strong>
              <p>
                Cabeçalho na linha {inspected.importNotes.header}; intervalo até
                a linha {inspected.importNotes.end}.
              </p>
              <p>{inspected.importNotes.details}</p>
            </div>
          )}
          <DataPreview source={inspected} limit={10} />
          <button
            className="primary-button"
            onClick={() => {
              setModal(null);
              guard(() => switchDraft(inspected, defaultConfig(inspected)));
            }}
          >
            Criar análise com esta fonte <ArrowRight size={16} />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === "help"}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Seu workspace de análises</DialogTitle>
            <DialogDescription>
              Uma primeira versão para experimentar o produto.
            </DialogDescription>
          </DialogHeader>
          <ol className="help-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Comece pelos dados</strong>
                <p>
                  Use a demonstração ou importe Excel e CSV em Fontes de dados.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Monte o painel do seu jeito</strong>
                <p>
                  Adicione indicadores, gráficos, tabelas e textos. Cada bloco
                  tem seus próprios dados, cores e tamanho. Arraste para
                  organizar e use Estilo para personalizar o painel.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Guarde sua análise</strong>
                <p>
                  Salve e reabra em Meus dashboards. Exporte o CSV para ter uma
                  cópia dos dados.
                </p>
              </div>
            </li>
          </ol>
          <div className="help-limit">
            <strong>O que esta prévia inclui</strong>
            <p>
              Gráficos e cálculos reais, comandos guiados e armazenamento local
              ou na sua conta. Ainda sem IA generativa, login, equipes ou
              publicação de painéis. Os arquivos salvos não são sincronizados
              com outros dispositivos.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir{" "}
              {remove?.type === "source" ? "fonte de dados" : "dashboard"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{remove?.name}” será removido{" "}
              {storage.cloud ? "da sua conta" : "deste navegador"}.{" "}
              {remove?.type === "source"
                ? "O arquivo original no seu computador não será alterado."
                : "A fonte de dados será mantida."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="delete-button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void deleteItem();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Descartar as alterações do rascunho?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este dashboard tem alterações não salvas. Volte e salve para
              mantê-las, ou continue para abrir outra análise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pending.current = null;
              }}
            >
              Voltar ao rascunho
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDirty(false);
                pending.current?.();
                pending.current = null;
              }}
            >
              Descartar e continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
