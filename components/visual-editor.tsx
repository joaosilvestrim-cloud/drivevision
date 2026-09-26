"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  SlidersHorizontal,
  Palette,
  Eye,
  Pencil,
  Undo2,
  Redo2,
  GripVertical,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  Hash,
  Table2,
  Type,
  Database,
  LayoutTemplate,
  X,
  Sparkles,
  Check,
  Download,
  Search,
  Microscope,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Choice,
  DataPreview,
  downloadFile,
} from "@/components/analytics-studio";
import { VisualChart } from "@/components/chart-renderer";
import { toCSV, type Config, type Source } from "@/lib/analytics";
import {
  DEFAULT_APPEARANCE,
  PALETTES,
  VISUAL_TYPES,
  initialVisuals,
  makeVisual,
  boardRows,
  reorderVisuals,
  requestVisual,
  type Visual,
  type VisualType,
} from "@/lib/visual-builder";

import { AnalysisHub, DrillExplorer } from "./analysis-hub";
import { BookmarkBar } from "./bookmark-bar";
import {
  applySelections,
  addSelection,
  type Selection,
  type PivotSpec,
} from "@/lib/exploration";
import { applyFilters } from "@/lib/data-model";
import { DataStudio } from "./data-studio";
import { ChartStudio } from "./chart-studio";
import { FiltersDialog } from "./filters-dialog";
import { prepareSource } from "@/lib/data-model";
import { applyModel } from "@/lib/workspace-model";

const icons = {
  kpi: Hash,
  line: LineChart,
  area: AreaChart,
  bar: BarChart3,
  horizontal: BarChart3,
  donut: PieChart,
  table: Table2,
  text: Type,
  combo: BarChart3,
  pivot: Table2,
};
const modes = [
  { value: "sum", label: "Soma" },
  { value: "average", label: "Média" },
  { value: "count", label: "Contagem" },
];

export function VisualEditor({
  source: original,
  config,
  onChange,
}: {
  source: Source;
  config: Config;
  onChange: (c: Config) => void;
}) {
  const prepared = useMemo(
    () => prepareSource(original, config.dataSteps),
    [original, config.dataSteps],
  );
  const source = prepared.source;
  const [dataOpen, setDataOpen] = useState(false),
    [chartId, setChartId] = useState<string | null>(null),
    [filtersOpen, setFiltersOpen] = useState(false);
  const visuals = useMemo(
    () => initialVisuals(source, config),
    [source, config],
  );
  const [hubOpen, setHubOpen] = useState(false);
  const [drill, setDrill] = useState<{
    visual?: Visual;
    selections: Selection[];
  } | null>(null);
  const appearance = { ...DEFAULT_APPEARANCE, ...config.appearance };
  const rows = useMemo(() => boardRows(source, config), [source, config]);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [editing, setEditing] = useState(true);
  const [gallery, setGallery] = useState(false),
    [templates, setTemplates] = useState(false),
    [table, setTable] = useState(false);
  const [past, setPast] = useState<Config[]>([]),
    [future, setFuture] = useState<Config[]>([]);
  const [small, setSmall] = useState(false),
    [panelOpen, setPanelOpen] = useState(false),
    [panelTab, setPanelTab] = useState("visual");
  const [dragged, setDragged] = useState<string | null>(null),
    [dropId, setDropId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(""),
    [answer, setAnswer] = useState("");
  const [filterField, setFilterField] = useState(
    config.filter?.field || config.dimension,
  );
  const selected = visuals.find((v) => v.id === selectedId);
  const dimensions = source.columns.filter((c) => !source.numeric.includes(c));
  const filterValues = useMemo(
    () =>
      [...new Set(source.rows.map((r) => r[filterField]))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [source, filterField],
  );
  useEffect(() => {
    const query = matchMedia("(max-width: 1100px)");
    const sync = () => setSmall(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  function commit(next: Config) {
    setPast((h) => [...h.slice(-29), { ...config, visuals }]);
    setFuture([]);
    onChange(next);
  }
  function changeVisuals(next: Visual[]) {
    commit({ ...config, visuals: next });
  }
  function updateVisual(patch: Partial<Visual>) {
    if (selected)
      changeVisuals(
        visuals.map((v) =>
          v.id === selected.id
            ? {
                ...v,
                ...patch,
                ...("color" in patch && v.measures
                  ? {
                      measures: v.measures.map((m, i) =>
                        i === 0
                          ? { ...m, color: patch.color || appearance.accent }
                          : m,
                      ),
                    }
                  : {}),
              }
            : v,
        ),
      );
  }
  function select(id: string) {
    setSelectedId(id);
    setPanelTab("visual");
    setChartId(id);
  }
  function openPanel(tab: string) {
    setPanelTab(tab);
    setPanelOpen(true);
  }
  function add(type: VisualType) {
    if (visuals.length >= 24) return;
    const item = makeVisual(type, source, config, crypto.randomUUID());
    changeVisuals([...visuals, item]);
    setGallery(false);
    select(item.id);
  }
  function move(id: string, delta: number) {
    const pos = visuals.findIndex((v) => v.id === id),
      target = visuals[pos + delta];
    if (target) changeVisuals(reorderVisuals(visuals, id, target.id));
  }
  function duplicate(v: Visual) {
    if (visuals.length >= 24) return;
    const copied = {
      ...v,
      id: crypto.randomUUID(),
      title: `${v.title} · cópia`,
    };
    const next = [...visuals];
    next.splice(visuals.findIndex((x) => x.id === v.id) + 1, 0, copied);
    changeVisuals(next);
    select(copied.id);
  }
  function undo() {
    if (!past.length) return;
    setFuture((h) => [...h, { ...config, visuals }]);
    onChange(past[past.length - 1]);
    setPast((h) => h.slice(0, -1));
  }
  function redo() {
    if (!future.length) return;
    setPast((h) => [...h, { ...config, visuals }]);
    onChange(future[future.length - 1]);
    setFuture((h) => h.slice(0, -1));
  }
  function applyTemplate(kind: "commercial" | "explore" | "blank") {
    const seed = { ...config, visuals: undefined };
    const next =
      kind === "blank"
        ? []
        : kind === "commercial"
          ? initialVisuals(source, seed)
          : [
              makeVisual("bar", source, seed, crypto.randomUUID()),
              makeVisual("horizontal", source, seed, crypto.randomUUID()),
              {
                ...makeVisual("table", source, seed, crypto.randomUUID()),
                span: 12 as const,
              },
            ];
    changeVisuals(next);
    setSelectedId(null);
    setTemplates(false);
    setPanelOpen(false);
  }
  function ask(text = prompt) {
    if (!text.trim()) return;
    const result = requestVisual(text, source, config, crypto.randomUUID());
    if (result.changed) {
      commit(result.config);
      if ("selected" in result && typeof result.selected === "string")
        setSelectedId(result.selected);
    }
    setAnswer(result.message);
    setPrompt("");
  }
  const inspector = (
    <Tabs
      value={panelTab}
      onValueChange={setPanelTab}
      className="inspector-tabs"
    >
      <TabsList>
        <TabsTrigger value="visual">Visual</TabsTrigger>
        <TabsTrigger value="design">Painel</TabsTrigger>
        <TabsTrigger value="assistant">
          <Sparkles size={13} /> Assistente
        </TabsTrigger>
      </TabsList>
      <TabsContent value="visual">
        {selected ? (
          <div className="property-fields">
            <div className="inspector-label">
              <span>EDITANDO VISUAL</span>
              <span>
                {visuals.findIndex((v) => v.id === selected.id) + 1} /{" "}
                {visuals.length}
              </span>
            </div>
            <label>
              Título
              <Input
                aria-label="Título do visual"
                value={selected.title}
                maxLength={90}
                onChange={(e) => updateVisual({ title: e.target.value })}
              />
            </label>
            <label>
              Tipo de visual
              <Choice
                label="Tipo de visual"
                value={selected.type}
                onChange={(v) =>
                  updateVisual({
                    type: v as VisualType,
                    height:
                      v === "kpi"
                        ? 180
                        : selected.height < 240
                          ? 320
                          : selected.height,
                  })
                }
                items={VISUAL_TYPES.map((v) => ({
                  value: v.type,
                  label: v.label,
                }))}
              />
            </label>
            <button
              className="primary-button"
              onClick={() => setChartId(selected.id)}
            >
              <SlidersHorizontal size={16} /> Configurar dados e gráfico
            </button>
            <p className="property-hint">
              Compare medidas, crie séries, defina agregações, eixos, formatos e
              filtros próprios no construtor com prévia.
            </p>{" "}
            <div className="property-divider">APARÊNCIA</div>
            <label>
              Cor do visual
              <div className="swatch-row">
                <button
                  className={`inherit-color ${!selected.color ? "active" : ""}`}
                  onClick={() => updateVisual({ color: undefined })}
                  title="Usar cor do painel"
                  aria-label="Usar cor do painel"
                >
                  <Palette size={16} />
                </button>
                {PALETTES.map((p) => (
                  <button
                    key={p.color}
                    className="color-swatch"
                    style={{ background: p.color }}
                    aria-label={`Cor ${p.name}`}
                    aria-pressed={selected.color === p.color}
                    onClick={() => updateVisual({ color: p.color })}
                  >
                    {selected.color === p.color && <Check size={14} />}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Cor personalizada do visual"
                  value={selected.color || appearance.accent}
                  onChange={(e) => updateVisual({ color: e.target.value })}
                />
              </div>
            </label>
            <label>
              Largura
              <Choice
                label="Largura do visual"
                value={String(selected.span)}
                onChange={(v) =>
                  updateVisual({ span: Number(v) as Visual["span"] })
                }
                items={[
                  { value: "4", label: "Um terço" },
                  { value: "6", label: "Metade" },
                  { value: "8", label: "Dois terços" },
                  { value: "12", label: "Linha inteira" },
                ]}
              />
            </label>
            <label>
              Altura <span className="field-value">{selected.height} px</span>
              <Slider
                aria-label="Altura do visual"
                min={160}
                max={520}
                step={40}
                value={[selected.height]}
                onValueChange={(v) => updateVisual({ height: v[0] })}
              />
            </label>
            {!["kpi", "text", "table"].includes(selected.type) && (
              <>
                <label className="toggle-field">
                  Exibir legenda
                  <Switch
                    aria-label="Exibir legenda"
                    checked={selected.legend}
                    onCheckedChange={(v) => updateVisual({ legend: v })}
                  />
                </label>
                {selected.type !== "donut" && (
                  <label className="toggle-field">
                    Linhas de referência
                    <Switch
                      aria-label="Linhas de referência"
                      checked={selected.grid}
                      onCheckedChange={(v) => updateVisual({ grid: v })}
                    />
                  </label>
                )}
              </>
            )}
            <div className="property-divider">ORGANIZAÇÃO</div>
            <div className="inspector-actions">
              <button
                className="secondary-button"
                disabled={visuals[0]?.id === selected.id}
                onClick={() => move(selected.id, -1)}
              >
                <ArrowUp size={14} /> Antes
              </button>
              <button
                className="secondary-button"
                disabled={visuals.at(-1)?.id === selected.id}
                onClick={() => move(selected.id, 1)}
              >
                <ArrowDown size={14} /> Depois
              </button>
            </div>
            <button
              className="secondary-button"
              disabled={visuals.length >= 24}
              onClick={() => duplicate(selected)}
            >
              <Copy size={14} /> Duplicar visual
            </button>
            <button
              className="remove-visual"
              onClick={() => {
                changeVisuals(visuals.filter((v) => v.id !== selected.id));
                setSelectedId(null);
                setPanelOpen(false);
              }}
            >
              <Trash2 size={14} /> Remover visual
            </button>
          </div>
        ) : (
          <div className="inspector-empty">
            <SlidersHorizontal size={28} />
            <h3>O painel é seu.</h3>
            <p>Selecione um bloco para mudar os dados, o formato e o estilo.</p>
            <button className="primary-button" onClick={() => setGallery(true)}>
              <Plus size={16} /> Adicionar visual
            </button>
            <div className="editor-tips">
              <span>
                <GripVertical size={15} /> Arraste os blocos para organizar
              </span>
              <span>
                <Palette size={15} /> Personalize cada visual
              </span>
              <span>
                <Eye size={15} /> Veja como sua equipe verá
              </span>
            </div>
          </div>
        )}
      </TabsContent>
      <TabsContent value="design">
        <div className="property-fields">
          <div className="inspector-label">IDENTIDADE DO PAINEL</div>
          <label>
            Título do dashboard
            <Input
              aria-label="Título do painel"
              value={config.title}
              maxLength={80}
              onChange={(e) => commit({ ...config, title: e.target.value })}
            />
          </label>
          <label>
            Paleta de cores
            <div className="theme-options">
              {PALETTES.map((p) => (
                <button
                  key={p.color}
                  aria-label={`Paleta ${p.name}`}
                  aria-pressed={appearance.accent === p.color}
                  className={appearance.accent === p.color ? "chosen" : ""}
                  onClick={() =>
                    commit({
                      ...config,
                      appearance: { ...appearance, accent: p.color },
                    })
                  }
                >
                  <i style={{ background: p.color }} />
                  <span>{p.name}</span>
                  {appearance.accent === p.color && <Check size={14} />}
                </button>
              ))}
            </div>
          </label>
          <label>
            Cor da sua marca
            <input
              className="brand-color"
              type="color"
              aria-label="Cor da marca"
              value={appearance.accent}
              onChange={(e) =>
                commit({
                  ...config,
                  appearance: { ...appearance, accent: e.target.value },
                })
              }
            />
          </label>
          <label>
            Fundo do painel
            <Choice
              label="Fundo do painel"
              value={appearance.mode}
              onChange={(v) =>
                commit({
                  ...config,
                  appearance: { ...appearance, mode: v as "light" | "dark" },
                })
              }
              items={[
                { value: "light", label: "Claro" },
                { value: "dark", label: "Escuro" },
              ]}
            />
          </label>
          <label>
            Espaçamento
            <Choice
              label="Espaçamento"
              value={appearance.spacing}
              onChange={(v) =>
                commit({
                  ...config,
                  appearance: {
                    ...appearance,
                    spacing: v as "compact" | "comfortable",
                  },
                })
              }
              items={[
                { value: "comfortable", label: "Confortável" },
                { value: "compact", label: "Compacto" },
              ]}
            />
          </label>
          <label className="toggle-field">
            Cantos arredondados
            <Switch
              aria-label="Cantos arredondados"
              checked={appearance.rounded}
              onCheckedChange={(v) =>
                commit({ ...config, appearance: { ...appearance, rounded: v } })
              }
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => setTemplates(true)}
          >
            <LayoutTemplate size={16} /> Trocar modelo do painel
          </button>
          <p className="property-hint">
            A paleta é aplicada aos visuais sem uma cor individual. Todas as
            alterações são guardadas ao salvar o dashboard.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="assistant">
        <div className="property-fields assistant-builder">
          <span className="mode-label">COMANDOS GUIADOS</span>
          <h3>Dê forma à sua ideia.</h3>
          <p>Peça um novo visual e continue personalizando no editor.</p>
          {[
            `Adicione uma rosca de ${config.metric} por ${config.dimension}`,
            `Adicione um indicador de média de ${config.metric}`,
            "Adicione uma tabela",
          ].map((t) => (
            <button key={t} className="suggestion" onClick={() => ask(t)}>
              {t}
              <ArrowRight size={14} />
            </button>
          ))}
          {answer && (
            <div className="builder-answer" role="status">
              {answer}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <textarea
              aria-label="Pedido ao assistente"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Adicione um gráfico de…"
              maxLength={1200}
              rows={4}
            />
            <button
              className="primary-button"
              disabled={!prompt.trim()}
              type="submit"
            >
              Aplicar pedido <ArrowUp size={15} />
            </button>
          </form>
          <p className="property-hint">
            IA generativa ainda não conectada. O editor visual funciona
            independentemente dela.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
  return (
    <section className="editor-shell" aria-label="Editor de dashboards">
      <div className="editor-topbar">
        <div className="editor-state">
          <span className="editor-mode">
            {editing ? <Pencil size={13} /> : <Eye size={13} />}{" "}
            {editing ? "MODO DE EDIÇÃO" : "VISUALIZAÇÃO"}
          </span>
          <span>{visuals.length} visuais</span>
        </div>
        <div className="editor-top-actions">
          {editing && (
            <>
              <button
                className="secondary-button prepare-data-button"
                onClick={() => setDataOpen(true)}
              >
                <Database size={16} /> Preparar dados
              </button>
              <button
                className="editor-icon"
                aria-label="Desfazer"
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="editor-icon"
                aria-label="Refazer"
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <span className="toolbar-separator" />
              <button
                className="secondary-button"
                aria-label="Modelos"
                onClick={() => setTemplates(true)}
              >
                <LayoutTemplate size={16} />
                <span>Modelos</span>
              </button>
              <button
                className="secondary-button"
                aria-label="Estilo"
                onClick={() => openPanel("design")}
              >
                <Palette size={16} />
                <span>Estilo</span>
              </button>
            </>
          )}
          <button
            className="secondary-button"
            onClick={() => {
              setEditing((v) => !v);
              setPanelOpen(false);
            }}
          >
            {editing ? <Eye size={16} /> : <Pencil size={16} />}{" "}
            {editing ? "Visualizar" : "Editar painel"}
          </button>
          {editing && (
            <button
              className="primary-button"
              disabled={visuals.length >= 24}
              onClick={() => setGallery(true)}
            >
              <Plus size={16} /> Adicionar visual
            </button>
          )}
        </div>
      </div>
      <div className="analysis-launch">
        <button onClick={() => setHubOpen(true)}>
          <Microscope size={18} />
          <span>
            <strong>Explorar e analisar</strong>
            <small>Tabela dinâmica, destaques e qualidade dos dados</small>
          </span>
          <ArrowRight size={18} />
        </button>
        <span>
          Clique em Explorar nos visuais para investigar os registros.
        </span>
      </div>
      <BookmarkBar config={config} onChange={commit} />
      <div className="editor-filterbar">
        <div className="source-chip">
          <Database size={14} />
          <span>{source.demo ? "Base de demonstração" : source.name}</span>
        </div>
        <Choice
          label="Período do painel"
          value={config.period}
          onChange={(v) => commit({ ...config, period: v as Config["period"] })}
          disabled={!source.dates.length}
          items={[
            { value: "all", label: "Todo o período" },
            { value: "30", label: "Últimos 30 dias da base" },
            { value: "90", label: "Últimos 90 dias da base" },
          ]}
        />
        {dimensions.length > 0 && (
          <>
            <Choice
              label="Campo do filtro"
              value={filterField}
              onChange={(v) => {
                setFilterField(v);
                if (config.filter) commit({ ...config, filter: undefined });
              }}
              items={dimensions.map((c) => ({ value: c, label: c }))}
            />
            <Choice
              label="Valor do filtro"
              value={
                config.filter && config.filter.field === filterField
                  ? `value:${config.filter.value}`
                  : "all"
              }
              onChange={(v) =>
                commit({
                  ...config,
                  filter:
                    v === "all"
                      ? undefined
                      : { field: filterField, value: v.slice(6) },
                })
              }
              items={[
                { value: "all", label: "Todos" },
                ...filterValues.map((v) => ({ value: `value:${v}`, label: v })),
              ]}
            />
          </>
        )}
        <button
          className="secondary-button"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal size={15} /> Filtros avançados{" "}
          {config.filters?.rules.length
            ? `(${config.filters.rules.length})`
            : ""}
        </button>
        <button className="text-button" onClick={() => setTable(true)}>
          <Table2 size={15} /> Dados
        </button>
        <span className="row-count">
          {rows.length.toLocaleString("pt-BR")} registros
        </span>
      </div>
      {prepared.error && (
        <div className="model-error" role="alert">
          {prepared.error}
        </div>
      )}
      {config.dataSteps?.length ? (
        <div className="model-applied-banner">
          <Database size={14} />
          {config.dataSteps.length} etapas de preparação aplicadas ·{" "}
          {source.columns.length} colunas disponíveis
          <button onClick={() => setDataOpen(true)}>Ver preparação</button>
        </div>
      ) : null}
      {config.filter && (
        <div className="active-filter">
          {config.filter.field}: <strong>{config.filter.value}</strong>
          <button
            aria-label="Limpar filtro"
            onClick={() => commit({ ...config, filter: undefined })}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div
        className={`editor-workspace ${editing && !small ? "with-inspector" : ""}`}
      >
        <div
          className={`dashboard-canvas ${appearance.mode} ${appearance.spacing} ${appearance.rounded ? "rounded" : "square"} ${editing ? "editing" : "presenting"}`}
          style={{ "--board-accent": appearance.accent } as React.CSSProperties}
        >
          <div className="canvas-heading">
            <span>{editing ? "ÁREA DO DASHBOARD" : config.title}</span>
            <span>
              {source.demo ? "DADOS DE EXEMPLO" : "DADOS DA SUA EMPRESA"}
            </span>
          </div>
          <div className="visual-grid">
            {visuals.map((v, index) => (
              <article
                key={v.id}
                className={`visual-card span-${v.span} ${editing && selectedId === v.id ? "is-selected" : ""} ${dropId === v.id ? "drop-target" : ""}`}
                style={{
                  minHeight: v.height,
                  height: v.type === "text" ? "auto" : v.height,
                }}
                onDragOver={(e) => {
                  if (dragged) {
                    e.preventDefault();
                    setDropId(v.id);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged)
                    changeVisuals(reorderVisuals(visuals, dragged, v.id));
                  setDragged(null);
                  setDropId(null);
                }}
              >
                <div className="visual-card-heading">
                  <div className="visual-title-wrap">
                    {editing && (
                      <span
                        className="drag-handle"
                        draggable
                        aria-label={`Arrastar ${v.title}`}
                        title="Arraste para reorganizar"
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", v.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragged(v.id);
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropId(null);
                        }}
                      >
                        <GripVertical size={16} />
                      </span>
                    )}
                    <div>
                      <h3>{v.title || "Visual sem título"}</h3>
                      {v.subtitle && (
                        <p className="visual-subtitle">{v.subtitle}</p>
                      )}
                    </div>
                  </div>
                  {v.type !== "text" && (
                    <button
                      className="visual-edit"
                      aria-label={`Explorar ${v.title}`}
                      title="Explorar registros"
                      onClick={() => setDrill({ visual: v, selections: [] })}
                    >
                      <Search size={15} />
                    </button>
                  )}
                  {editing && (
                    <button
                      className={`visual-edit ${selectedId === v.id ? "active" : ""}`}
                      aria-label={`Editar ${v.title}`}
                      onClick={() => select(v.id)}
                    >
                      <SlidersHorizontal size={15} />
                      <span className="configure-label">Configurar</span>
                    </button>
                  )}
                </div>
                <div
                  className="visual-content"
                  onClick={editing ? () => select(v.id) : undefined}
                  style={{ cursor: editing ? "pointer" : undefined }}
                >
                  <VisualChart
                    visual={v}
                    source={source}
                    rows={rows}
                    color={v.color || appearance.accent}
                    dark={appearance.mode === "dark"}
                    onInspect={
                      !editing
                        ? (selections) => setDrill({ visual: v, selections })
                        : undefined
                    }
                    onFilter={
                      !editing
                        ? (value) =>
                            setDrill({
                              visual: v,
                              selections: [
                                {
                                  field: v.dimension,
                                  value,
                                  grain: source.dates.includes(v.dimension)
                                    ? v.grain
                                    : undefined,
                                },
                              ],
                            })
                        : undefined
                    }
                  />
                </div>
                {editing && (
                  <div className="visual-card-footer">
                    <span>
                      {VISUAL_TYPES.find((t) => t.type === v.type)?.label}{" "}
                      {v.type !== "text" && `· ${v.metric}`}
                    </span>
                    <div>
                      <button
                        aria-label={`Mover ${v.title} antes`}
                        disabled={index === 0}
                        onClick={() => move(v.id, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        aria-label={`Mover ${v.title} depois`}
                        disabled={index === visuals.length - 1}
                        onClick={() => move(v.id, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        aria-label={`Duplicar ${v.title}`}
                        disabled={visuals.length >= 24}
                        onClick={() => duplicate(v)}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!visuals.length && (
            <div className="blank-canvas">
              <span>
                <LayoutTemplate size={34} />
              </span>
              <h2>Comece com uma ideia.</h2>
              <p>
                Adicione os indicadores e gráficos que fazem sentido para o seu
                negócio.
              </p>
              {editing && (
                <button
                  className="primary-button"
                  onClick={() => setGallery(true)}
                >
                  <Plus size={17} /> Escolher meu primeiro visual
                </button>
              )}
            </div>
          )}
          {editing && visuals.length > 0 && visuals.length < 24 && (
            <button className="add-block" onClick={() => setGallery(true)}>
              <Plus size={18} /> Adicionar um novo visual ao painel
            </button>
          )}
          {!editing && (
            <p className="presentation-hint">
              Clique em um gráfico para explorar os registros e aplicar o
              recorte ao painel.
            </p>
          )}
        </div>
        {editing && !small && (
          <aside className="visual-inspector">
            <div className="inspector-heading">
              <SlidersHorizontal size={17} />
              <strong>Personalização</strong>
            </div>
            {inspector}
          </aside>
        )}
      </div>
      <Sheet open={small && panelOpen && editing} onOpenChange={setPanelOpen}>
        <SheetContent className="editor-sheet">
          <SheetHeader>
            <SheetTitle>Personalizar dashboard</SheetTitle>
            <SheetDescription>
              Altere o visual selecionado ou o estilo do painel.
            </SheetDescription>
          </SheetHeader>
          {inspector}
          <button
            className="primary-button sheet-done"
            onClick={() => setPanelOpen(false)}
          >
            Voltar ao painel <Check size={16} />
          </button>
        </SheetContent>
      </Sheet>
      {hubOpen && (
        <AnalysisHub
          canAdd={visuals.length < 24}
          source={source}
          rows={rows}
          onClose={() => setHubOpen(false)}
          onPrepare={() => {
            setHubOpen(false);
            setDataOpen(true);
          }}
          onDrill={(selections) => {
            setHubOpen(false);
            setDrill({ selections });
          }}
          onAdd={(spec: PivotSpec) => {
            if (visuals.length >= 24) return;
            const v = {
              ...makeVisual("pivot", source, config, crypto.randomUUID()),
              title: `${spec.metric} · ${spec.row} × ${spec.column}`,
              dimension: spec.row,
              pivotColumn: spec.column,
              heatmap: spec.heatmap,
              metric: spec.metric,
              span: 12 as const,
              height: 400,
              measures: [
                {
                  id: crypto.randomUUID(),
                  field: spec.metric,
                  aggregation: spec.aggregation,
                  label: spec.metric,
                  color: appearance.accent,
                },
              ],
            };
            changeVisuals([...visuals, v]);
            setHubOpen(false);
          }}
        />
      )}
      {drill && (
        <DrillExplorer
          source={source}
          rows={applySelections(
            applyFilters(rows, source, drill.visual?.filters),
            drill.selections,
          )}
          visual={drill.visual}
          selections={drill.selections}
          onClose={() => setDrill(null)}
          onFilter={(selections) => {
            commit({
              ...config,
              selections: selections.reduce(
                (all, s) => addSelection(all, s),
                config.selections ?? [],
              ),
            });
            setDrill(null);
          }}
        />
      )}
      <Dialog open={gallery} onOpenChange={setGallery}>
        <DialogContent className="app-dialog visual-gallery">
          <DialogHeader>
            <DialogTitle>Qual história seus dados contam?</DialogTitle>
            <DialogDescription>
              Escolha um visual. Depois, ajuste os dados e deixe com a sua cara.
            </DialogDescription>
          </DialogHeader>
          <div className="visual-type-grid">
            {VISUAL_TYPES.map((t) => {
              const Icon = icons[t.type];
              return (
                <button
                  key={t.type}
                  className="visual-type-card"
                  disabled={visuals.length >= 24}
                  onClick={() => add(t.type)}
                >
                  <span className={`type-preview ${t.type}`}>
                    <Icon size={35} strokeWidth={1.4} />
                  </span>
                  <strong>{t.label}</strong>
                  <small>{t.description}</small>
                  <Plus size={15} className="type-plus" />
                </button>
              );
            })}
          </div>
          <p className="property-hint">
            Cada visual pode usar um indicador, um cálculo e um agrupamento
            diferente.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={templates} onOpenChange={setTemplates}>
        <DialogContent className="app-dialog template-dialog">
          <DialogHeader>
            <DialogTitle>Um ponto de partida para sua análise</DialogTitle>
            <DialogDescription>
              O modelo substitui os blocos atuais. Você pode desfazer a troca.
            </DialogDescription>
          </DialogHeader>
          <div className="template-grid">
            {[
              {
                id: "commercial",
                title: "Visão executiva",
                desc: "Indicadores, evolução e participação",
                blocks: [4, 4, 4, 8, 4],
              },
              {
                id: "explore",
                title: "Exploração de dados",
                desc: "Comparações, ranking e tabela",
                blocks: [6, 6, 12],
              },
              {
                id: "blank",
                title: "Tela em branco",
                desc: "Liberdade para começar do zero",
                blocks: [],
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() =>
                  applyTemplate(t.id as "commercial" | "explore" | "blank")
                }
              >
                <div className="template-preview">
                  {t.blocks.length ? (
                    t.blocks.map((span, i) => (
                      <i key={i} style={{ gridColumn: `span ${span}` }} />
                    ))
                  ) : (
                    <Plus size={25} />
                  )}
                </div>
                <strong>{t.title}</strong>
                <span>{t.desc}</span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={table} onOpenChange={setTable}>
        <DialogContent className="app-dialog wide-dialog">
          <DialogHeader>
            <DialogTitle>Dados deste painel</DialogTitle>
            <DialogDescription>
              {rows.length} registros após os filtros de período e categoria.
            </DialogDescription>
          </DialogHeader>
          <DataPreview source={{ ...source, rows }} limit={50} />
          <button
            className="primary-button"
            onClick={() =>
              downloadFile(
                "drivedata-painel.csv",
                toCSV(source, rows),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={16} /> Exportar dados filtrados
          </button>
        </DialogContent>
      </Dialog>
      {dataOpen && (
        <DataStudio
          original={original}
          steps={config.dataSteps ?? []}
          onClose={() => setDataOpen(false)}
          onApply={(steps) => {
            const next = applyModel(original, config, steps);
            commit(next);
            setFilterField(next.filter?.field || next.dimension);
            setDataOpen(false);
          }}
        />
      )}
      {chartId && visuals.find((v) => v.id === chartId) && (
        <ChartStudio
          visual={visuals.find((v) => v.id === chartId)!}
          source={source}
          rows={rows}
          color={appearance.accent}
          onClose={() => setChartId(null)}
          onApply={(visual) => {
            changeVisuals(
              visuals.map((v) => (v.id === visual.id ? visual : v)),
            );
            setChartId(null);
          }}
        />
      )}
      {filtersOpen && (
        <FiltersDialog
          source={source}
          value={config.filters}
          onClose={() => setFiltersOpen(false)}
          onApply={(filters) => {
            commit({ ...config, filters });
            setFiltersOpen(false);
          }}
        />
      )}
    </section>
  );
}
