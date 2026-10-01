"use client";
import { t as translate, locale } from "@/lib/i18n";
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
  ShieldCheck,
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

import { DashboardLibrary } from "./dashboard-library";
import { duplicateDashboard } from "@/lib/dashboard-library";
import { makeVisual } from "@/lib/visual-builder";
import { CloudConnections } from "./cloud-connections";
import { refreshDerived } from "@/lib/source-lifecycle";
import { AdminPanel } from "./admin-panel";
import { SourceHistory } from "./source-history";

type View = "studio" | "library" | "sources" | "connections" | "admin";
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
        onClick={() => onNavigate("library")}
        aria-label={translate("DriveVision, início")}
      >
        <img
          className="product-logo"
          src="/drivedata-logo.png"
          alt=""
          width={36}
          height={36}
        />
        <span>
          {translate(" drivedata")}
          <span className="product-brand-label">
            {translate("DRIVEVISION")}
          </span>
        </span>
      </button>
      <nav
        className="product-nav-links"
        aria-label={translate("Navegação principal")}
      >
        {[
          { icon: LayoutDashboard, label: "Estúdio", id: "studio" },
          { icon: Layers, label: "Área de trabalho", id: "library" },
          { icon: Database, label: "Dados", id: "sources" },
          { icon: Cloud, label: "Conexões", id: "connections" },
          ...(account?.superAdmin
            ? [{ icon: ShieldCheck, label: "Administração", id: "admin" }]
            : []),
        ].map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onNavigate(id as View)}
          >
            <Icon size={17} />
            <span>{translate(label)}</span>
          </button>
        ))}
      </nav>
      <div className="product-nav-meta">
        <button
          className="account-button"
          onClick={onAccount}
          aria-label={
            account
              ? translate("Minha conta")
              : translate("Entrar ou criar conta")
          }
        >
          {account ? <Cloud size={16} /> : <UserRound size={16} />}
          <span>{account ? account.name : translate("Entrar")}</span>
        </button>
        <button
          className="product-help"
          onClick={onHelp}
          aria-label={translate("Como funciona")}
        >
          <CircleHelp size={19} />
        </button>
        <span className="product-avatar" aria-label={translate("DriveData")}>
          {translate(" DD ")}
        </span>
      </div>
    </header>
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
  const [view, setView] = useState<View>(() =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("view") === "connections"
        ? "connections"
        : account?.superAdmin &&
            typeof window !== "undefined" &&
            (/^\/admin\/?$/.test(window.location.pathname) ||
              new URLSearchParams(window.location.search).get("view") === "admin")
          ? "admin"
          : "library",
    ),
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
  const [remoteChanged, setRemoteChanged] = useState(false);
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
  const [historySource, setHistorySource] = useState<Source | null>(null);
  const [template, setTemplate] = useState("overview");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === "admin") {
      url.pathname = "/admin";
      url.searchParams.delete("view");
    } else if (
      /^\/admin\/?$/.test(url.pathname) ||
      url.searchParams.get("view") === "admin"
    ) {
      url.pathname = "/";
      url.searchParams.delete("ticket");
      url.searchParams.delete("view");
      if (view === "connections") url.searchParams.set("view", view);
    } else return;
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [view]);

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
    if (!loaded || !storage.hasRemoteChanges) return;
    let live = true,
      checking = false;
    const check = async () => {
      if (document.visibilityState !== "visible" || checking || busyRef.current)
        return;
      checking = true;
      try {
        const changed = await storage.hasRemoteChanges!();
        if (live) setRemoteChanged(changed);
      } catch {
        /* Keep the current workspace usable during transient failures. */
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [loaded, storage]);
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
      next = { ...next, sources: refreshDerived(next.sources) };
      await storage.save(next);
      setWorkspace(next);
      const currentSource = next.sources.find((s) => s.id === source.id);
      if (currentSource) setSource(currentSource);
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

  async function reloadRemoteWorkspace() {
    if (dirty)
      throw new Error(
        "Salve seu rascunho antes de carregar as fontes atualizadas.",
      );
    const next = await storage.load();
    setWorkspace(next);
    setStorageError(false);
    setRemoteChanged(false);
    const active = next.sources.find((s) => s.id === source.id);
    if (active) setSource(active);
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
      ...workspace.dashboards.find((d) => d.id === id),
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
        translate(
          "Essa fonte está vinculada a um dashboard. Exclua os dashboards vinculados primeiro.",
        ),
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
      toast.success(translate("Item removido do workspace."));
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
          const { boardRows, initialVisuals } =
            await import("@/lib/visual-builder");
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
    view === "admin"
      ? "Gestão de clientes"
      : view === "studio"
        ? config.title
        : view === "library"
          ? "Sua área de trabalho"
          : view === "connections"
            ? "Conexões"
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
            <span>{translate("Workspace")}</span>
            <ChevronRight size={14} />
            <strong>
              {view === "studio" ? translate("Visão geral") : translate(heading)}
            </strong>
          </div>
          <button className="version-badge" onClick={() => setModal("help")}>
            {translate(" GUIA DO DRIVEVISION ")}
          </button>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <h1>{translate(heading)}</h1>
              <p>
                {view === "admin"
                  ? translate(
                      "Cadastre clientes, libere acessos e acompanhe seus ambientes.",
                    )
                  : view === "studio"
                    ? translate(
                        "Modele seus dados. Crie seus gráficos. Encontre suas respostas.",
                      )
                    : view === "library"
                      ? translate(
                          "Suas análises organizadas. Prontas para o próximo passo.",
                        )
                      : view === "connections"
                        ? translate(
                            "Conecte suas origens. Escolha o conteúdo. Mantenha suas análises atualizadas.",
                          )
                        : translate(
                            "Traga sua planilha como ela está. Organize e conecte os dados aqui.",
                          )}
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
                  {translate(" Combinar bases ")}
                </button>
              )}
              {view === "studio" && (
                <button
                  className="secondary-button"
                  onClick={openSave}
                  disabled={!loaded || busy || storageError}
                >
                  <Save size={16} /> {translate(" Salvar ")}
                </button>
              )}
              {view !== "connections" && view !== "admin" && (
                <button
                  className="primary-button"
                  disabled={!loaded || busy}
                  onClick={view === "sources" ? openImport : openNew}
                >
                  <Plus size={17} />
                  {view === "sources"
                    ? translate("Importar planilha")
                    : translate("Novo dashboard")}
                </button>
              )}
            </div>
          </div>
          {storageError && (
            <div className="inline-error" role="alert">
              {translate(
                " O armazenamento está indisponível. A demonstração continua disponível; seus dados ainda não podem ser salvos. ",
              )}
            </div>
          )}
          {remoteChanged && (
            <div className="connection-alert workspace-refresh" role="status">
              <Cloud size={18} />
              <span>
                {translate(
                  " Novos dados estão disponíveis na nuvem. Recarregue para atualizar suas análises. ",
                )}
                {dirty
                  ? translate(" Exporte seu rascunho antes de recarregar.")
                  : ""}
              </span>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => guard(() => window.location.reload())}
              >
                {translate(" Recarregar dados ")}
              </button>
            </div>
          )}
          {view === "admin" && account?.superAdmin && <AdminPanel />}
          {view === "connections" && (
            <CloudConnections
              cloud={storage.cloud}
              onLogin={onAccount}
              onReload={reloadRemoteWorkspace}
              locked={dirty || busy || !loaded || storageError}
              onAnalyze={(id) => {
                const s = workspace.sources.find((s) => s.id === id);
                if (s) guard(() => switchDraft(s, defaultConfig(s)));
              }}
            />
          )}
          {view === "studio" && (
            <>
              <div className="draft-status">
                {dirty ? (
                  <>
                    <span className="draft-dot" />{" "}
                    {translate(" Rascunho · alterações não salvas ")}
                  </>
                ) : currentId ? (
                  <>
                    <Check size={13} />{" "}
                    {storage.cloud
                      ? translate("Salvo na sua conta")
                      : translate("Salvo neste navegador")}
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />{" "}
                    {translate(
                      " Explore a demonstração ou importe seus dados ",
                    )}
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
            <DashboardLibrary
              dashboards={workspace.dashboards}
              sources={sources}
              loaded={loaded}
              busy={busy || !loaded || storageError}
              cloud={storage.cloud}
              onNew={openNew}
              onImport={openImport}
              onOpen={(d) => {
                const s = sources.find((s) => s.id === d.sourceId);
                if (s) guard(() => switchDraft(s, d.config, d.id));
              }}
              onDelete={(d) =>
                setRemove({ type: "dashboard", id: d.id, name: d.config.title })
              }
              onDuplicate={async (d) => {
                const copy = duplicateDashboard(
                  d,
                  crypto.randomUUID(),
                  new Date().toISOString(),
                );
                if (
                  await persist({
                    ...workspace,
                    dashboards: [copy, ...workspace.dashboards],
                  })
                )
                  toast.success("Cópia criada. Edite sem alterar o original.");
              }}
              onUpdate={async (d, patch) => {
                const saved = {
                  ...d,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                };
                const ok = await persist({
                  ...workspace,
                  dashboards: workspace.dashboards.map((item) =>
                    item.id === d.id ? saved : item,
                  ),
                });
                if (ok && currentId === d.id && patch.config)
                  setConfig((c) => ({ ...c, title: patch.config!.title }));
                return ok;
              }}
            />
          )}
          {view === "sources" && (
            <>
              <button
                className="secondary-button source-connect-button"
                onClick={() => setView("connections")}
              >
                <Cloud size={16} />{" "}
                {translate(" Conectar SharePoint, OneDrive ou Google Drive ")}
                <ArrowRight size={15} />
              </button>
              <div className="import-banner">
                <span className="import-icon">
                  <FileSpreadsheet size={28} />
                </span>
                <div>
                  <h2>{translate("Uma planilha. Muitas respostas.")}</h2>
                  <p>
                    {translate(
                      " Importe Excel ou CSV, revise a estrutura encontrada e prepare seus dados. Até 10 MB e 20 mil registros na base final. ",
                    )}
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
                  {translate(" Baixar exemplo ")}
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
                        {s.rows.length.toLocaleString(locale())}{" "}
                        {translate(" registros ·")} {s.columns.length}{" "}
                        {translate(" colunas")}{" "}
                        <span>
                          ·{" "}
                          {s.demo
                            ? translate("Demonstração")
                            : storage.cloud
                              ? translate("Na sua conta")
                              : translate("Base local")}
                        </span>
                      </p>
                    </div>
                    <div className="source-actions">
                      {storage.cloud && !s.demo && (
                        <button
                          className="text-button"
                          onClick={() => guard(() => setHistorySource(s))}
                        >
                          {translate(" Histórico ")}
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => {
                          setInspected(s);
                          setModal("source");
                        }}
                      >
                        {translate(" Ver dados ")}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          guard(() => switchDraft(s, defaultConfig(s)))
                        }
                      >
                        {translate(" Analisar ")}
                        <ArrowRight size={15} />
                      </button>
                      {!s.demo && (
                        <button
                          className="icon-button"
                          aria-label={translate("Excluir fonte {v0}", {
                            v0: s.name,
                          })}
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
                    ? translate(
                        "A interpretação acontece no seu dispositivo. Ao confirmar, os dados organizados são salvos no workspace privado da sua conta.",
                      )
                    : translate(
                        "Os arquivos são lidos no seu dispositivo e salvos neste navegador. Entre na sua conta para salvar dados organizados na nuvem.",
                      )}
                </p>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>{translate("DriveVision · DriveData")}</span>
            <span>{translate("Transforme dados em próximos passos.")}</span>
          </footer>
        </div>
      </main>
      <Toaster position="bottom-right" richColors closeButton />
      {historySource && (
        <SourceHistory
          source={historySource}
          onClose={() => setHistorySource(null)}
          onChanged={async () => {
            const next = await storage.load();
            setWorkspace(next);
            const updated = next.sources.find((s) => s.id === source.id);
            if (updated) setSource(updated);
            setRemoteChanged(false);
            toast.success("Workspace e histórico atualizados.");
          }}
        />
      )}
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
            <DialogTitle>{translate("Vamos criar seu dashboard")}</DialogTitle>
            <DialogDescription>
              {translate(
                " Dê um nome à sua análise e escolha os dados para começar. ",
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const s = sources.find((s) => s.id === newSource);
              if (!s || !title.trim()) return;
              const nextConfig: Config = {
                ...defaultConfig(s),
                title: title.trim(),
                ...(template === "blank"
                  ? { visuals: [] }
                  : template === "comparison"
                    ? {
                        visuals: ["bar", "horizontal", "table"].map((type) =>
                          makeVisual(
                            type as "bar" | "horizontal" | "table",
                            s,
                            defaultConfig(s),
                            crypto.randomUUID(),
                          ),
                        ),
                      }
                    : template === "trends"
                      ? {
                          visuals: ["line", "area", "kpi"].map((type) =>
                            makeVisual(
                              type as "line" | "area" | "kpi",
                              s,
                              defaultConfig(s),
                              crypto.randomUUID(),
                            ),
                          ),
                        }
                      : {}),
              };
              setModal(null);
              guard(() => {
                void (async () => {
                  const dashboard: SavedDashboard = {
                    id: crypto.randomUUID(),
                    sourceId: s.id,
                    config: nextConfig,
                    updatedAt: new Date().toISOString(),
                  };
                  if (
                    await persist({
                      ...workspace,
                      dashboards: [dashboard, ...workspace.dashboards],
                    })
                  ) {
                    switchDraft(s, nextConfig, dashboard.id);
                    toast.success(
                      "Dashboard criado e salvo. Personalize seus visuais.",
                    );
                  } else if (dirty) setDirty(true);
                })();
              });
            }}
          >
            <div className="form-fields">
              <label htmlFor="dashboard-name">
                {translate(" Nome do dashboard ")}
                <Input
                  id="dashboard-name"
                  placeholder={translate("Ex.: Acompanhamento comercial")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  required
                  autoFocus
                />
              </label>
              <label>
                {translate(" Ponto de partida ")}
                <Choice
                  label={translate("Modelo inicial")}
                  value={template}
                  onChange={setTemplate}
                  items={[
                    {
                      value: "overview",
                      label: "Visão executiva · indicadores e evolução",
                    },
                    {
                      value: "comparison",
                      label: "Comparativo · categorias e ranking",
                    },
                    {
                      value: "trends",
                      label: "Tendências · séries ao longo do tempo",
                    },
                    {
                      value: "blank",
                      label: "Em branco · construa do seu jeito",
                    },
                  ]}
                />
              </label>
              <label>
                {translate(" Fonte de dados ")}
                <Choice
                  label={translate("Fonte de dados")}
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
              <Upload size={15} /> {translate(" Importar outra planilha ")}
            </button>
            <button
              className="primary-button full-button"
              disabled={!title.trim()}
              type="submit"
            >
              <Sparkles size={16} /> {translate(" Criar dashboard ")}
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
            <DialogTitle>{translate("Salvar dashboard")}</DialogTitle>
            <DialogDescription>
              {storage.cloud
                ? translate(
                    "O painel e a fonte ficam disponíveis na sua conta, em Meus dashboards.",
                  )
                : translate(
                    "O painel e a fonte ficam disponíveis em Meus dashboards neste navegador.",
                  )}
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
                {translate(" Nome do dashboard ")}
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
              {translate(" Salvar dashboard ")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      {modal === "import" && (
        <SmartImport
          sources={workspace.sources}
          cloud={storage.cloud}
          onClose={() => setModal(null)}
          onImport={async (imported) => {
            if (
              await persist({
                ...workspace,
                sources: workspace.sources.some((s) => s.id === imported.id)
                  ? workspace.sources.map((s) =>
                      s.id === imported.id ? imported : s,
                    )
                  : [...workspace.sources, imported],
              })
            ) {
              toast.success(
                `${imported.rows.length} registros prontos para analisar.`,
              );
              setModal(null);
              if (!workspace.sources.some((s) => s.id === imported.id))
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
                ? translate("Dados fictícios para explorar a plataforma.")
                : storage.cloud
                  ? translate("Dados importados e armazenados na sua conta.")
                  : translate(
                      "Dados importados e armazenados neste navegador.",
                    )}
            </DialogDescription>
          </DialogHeader>
          <div className="column-tags">
            {inspected.columns.map((c) => (
              <span key={c}>
                {inspected.numeric.includes(c)
                  ? "#"
                  : inspected.dates.includes(c)
                    ? "◷"
                    : translate("Aa")}{" "}
                {c}
              </span>
            ))}
          </div>
          {inspected.importNotes && (
            <div className="source-provenance">
              <strong>
                {translate(" Origem: ")}
                {inspected.importNotes.file} · {inspected.importNotes.sheet}
              </strong>
              <p>
                {translate(" Cabeçalho na linha ")}
                {inspected.importNotes.header}
                {translate("; intervalo até a linha ")}
                {inspected.importNotes.end}.
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
            {translate(" Criar análise com esta fonte ")}
            <ArrowRight size={16} />
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
            <DialogTitle>{translate("Seu workspace de análises")}</DialogTitle>
            <DialogDescription>
              {translate(
                " Transforme suas fontes de dados em análises que acompanham seu negócio. ",
              )}
            </DialogDescription>
          </DialogHeader>
          <ol className="help-steps">
            <li>
              <span>1</span>
              <div>
                <strong>{translate("Comece pelos dados")}</strong>
                <p>
                  {translate(
                    " Use a demonstração ou importe Excel e CSV em Fontes de dados. ",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>{translate("Monte o painel do seu jeito")}</strong>
                <p>
                  {translate(
                    " Adicione indicadores, gráficos, tabelas e textos. Cada bloco tem seus próprios dados, cores e tamanho. Arraste para organizar e use Estilo para personalizar o painel. ",
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>{translate("Guarde sua análise")}</strong>
                <p>
                  {translate(
                    " Salve e reabra em Meus dashboards. Exporte o CSV para ter uma cópia dos dados. ",
                  )}
                </p>
              </div>
            </li>
          </ol>
          <div className="help-limit">
            <strong>{translate("O que você pode fazer")}</strong>
            <p>
              {translate(
                " Área de trabalho com pastas, favoritos e múltiplos dashboards. Importação de planilhas, preparação de dados, filtros, exploração e 14 tipos de visualização. Arraste e redimensione seus gráficos e salve o resultado. ",
              )}
            </p>
            <p>
              {storage.cloud
                ? translate(
                    "Sua conta mantém fontes e painéis disponíveis em outros dispositivos.",
                  )
                : translate(
                    "No modo local, os dados ficam neste navegador. Entre em uma conta para salvar na nuvem.",
                  )}{" "}
              {translate(
                " Conecte OneDrive e SharePoint para agendar atualizações das fontes selecionadas. Coedição e publicação de painéis para terceiros ainda não estão disponíveis. ",
              )}
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
              {translate(" Excluir")}{" "}
              {remove?.type === "source"
                ? translate("fonte de dados")
                : translate("dashboard")}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{remove?.name}
              {translate("” será removido")}{" "}
              {storage.cloud
                ? translate("da sua conta")
                : translate("deste navegador")}
              .{" "}
              {remove?.type === "source"
                ? translate(
                    "O arquivo original no seu computador não será alterado.",
                  )
                : translate("A fonte de dados será mantida.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {translate("Cancelar")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="delete-button"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void deleteItem();
              }}
            >
              {translate(" Excluir ")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate(" Descartar as alterações do rascunho? ")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                " Este dashboard tem alterações não salvas. Volte e salve para mantê-las, ou continue para abrir outra análise. ",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pending.current = null;
              }}
            >
              {translate(" Voltar ao rascunho ")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDirty(false);
                pending.current?.();
                pending.current = null;
              }}
            >
              {translate(" Descartar e continuar ")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
