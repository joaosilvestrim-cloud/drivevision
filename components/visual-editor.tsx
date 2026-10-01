"use client";
import { t as translate, locale } from "@/lib/i18n";
import { useVisualDrag } from "@/hooks/use-visual-drag";
import { useVisualResize } from "@/hooks/use-visual-resize";
import {
  MoveDiagonal2,
  Radar,
  PanelsTopLeft,
  Funnel,
  Gauge,
} from "lucide-react";
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
  radar: Radar,
  treemap: PanelsTopLeft,
  funnel: Funnel,
  gauge: Gauge,
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
  const drag = useVisualDrag(
    visuals.map((v) => v.id),
    (ids) => {
      const byId = new Map(visuals.map((v) => [v.id, v]));
      changeVisuals(ids.map((id) => byId.get(id)!));
    },
  );
  const orderedVisuals = drag.order
    .map((id) => visuals.find((v) => v.id === id)!)
    .filter(Boolean);
  const resize = useVisualResize((id, patch) =>
    changeVisuals(visuals.map((v) => (v.id === id ? { ...v, ...patch } : v))),
  );
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
        <TabsTrigger value="visual">{translate("Visual")}</TabsTrigger>
        <TabsTrigger value="design">{translate("Painel")}</TabsTrigger>
        <TabsTrigger value="assistant">
          <Sparkles size={13} /> {translate(" Assistente ")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="visual">
        {selected ? (
          <div className="property-fields">
            <div className="inspector-label">
              <span>{translate("EDITANDO VISUAL")}</span>
              <span>
                {visuals.findIndex((v) => v.id === selected.id) + 1} /{" "}
                {visuals.length}
              </span>
            </div>
            <label>
              {translate(" Título ")}
              <Input
                aria-label={translate("Título do visual")}
                value={selected.title}
                maxLength={90}
                onChange={(e) => updateVisual({ title: e.target.value })}
              />
            </label>
            <label>
              {translate(" Tipo de visual ")}
              <Choice
                label={translate("Tipo de visual")}
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
              <SlidersHorizontal size={16} />{" "}
              {translate(" Configurar dados e gráfico ")}
            </button>
            <p className="property-hint">
              {translate(
                " Compare medidas, crie séries, defina agregações, eixos, formatos e filtros próprios no construtor com prévia. ",
              )}
            </p>{" "}
            <div className="property-divider">{translate("APARÊNCIA")}</div>
            <label>
              {translate(" Cor do visual ")}
              <div className="swatch-row">
                <button
                  className={`inherit-color ${!selected.color ? "active" : ""}`}
                  onClick={() => updateVisual({ color: undefined })}
                  title={translate("Usar cor do painel")}
                  aria-label={translate("Usar cor do painel")}
                >
                  <Palette size={16} />
                </button>
                {PALETTES.map((p) => (
                  <button
                    key={p.color}
                    className="color-swatch"
                    style={{ background: p.color }}
                    aria-label={translate("Cor {v0}", { v0: p.name })}
                    aria-pressed={selected.color === p.color}
                    onClick={() => updateVisual({ color: p.color })}
                  >
                    {selected.color === p.color && <Check size={14} />}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label={translate("Cor personalizada do visual")}
                  value={selected.color || appearance.accent}
                  onChange={(e) => updateVisual({ color: e.target.value })}
                />
              </div>
            </label>
            <label>
              {translate(" Largura ")}
              <Choice
                label={translate("Largura do visual")}
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
              {translate(" Altura ")}
              <span className="field-value">
                {selected.height} {translate(" px")}
              </span>
              <Slider
                aria-label={translate("Altura do visual")}
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
                  {translate(" Exibir legenda ")}
                  <Switch
                    aria-label={translate("Exibir legenda")}
                    checked={selected.legend}
                    onCheckedChange={(v) => updateVisual({ legend: v })}
                  />
                </label>
                {selected.type !== "donut" && (
                  <label className="toggle-field">
                    {translate(" Linhas de referência ")}
                    <Switch
                      aria-label={translate("Linhas de referência")}
                      checked={selected.grid}
                      onCheckedChange={(v) => updateVisual({ grid: v })}
                    />
                  </label>
                )}
              </>
            )}
            <div className="property-divider">{translate("ORGANIZAÇÃO")}</div>
            <div className="inspector-actions">
              <button
                className="secondary-button"
                disabled={visuals[0]?.id === selected.id}
                onClick={() => move(selected.id, -1)}
              >
                <ArrowUp size={14} /> {translate(" Antes ")}
              </button>
              <button
                className="secondary-button"
                disabled={visuals.at(-1)?.id === selected.id}
                onClick={() => move(selected.id, 1)}
              >
                <ArrowDown size={14} /> {translate(" Depois ")}
              </button>
            </div>
            <button
              className="secondary-button"
              disabled={visuals.length >= 24}
              onClick={() => duplicate(selected)}
            >
              <Copy size={14} /> {translate(" Duplicar visual ")}
            </button>
            <button
              className="remove-visual"
              onClick={() => {
                changeVisuals(visuals.filter((v) => v.id !== selected.id));
                setSelectedId(null);
                setPanelOpen(false);
              }}
            >
              <Trash2 size={14} /> {translate(" Remover visual ")}
            </button>
          </div>
        ) : (
          <div className="inspector-empty">
            <SlidersHorizontal size={28} />
            <h3>{translate("O painel é seu.")}</h3>
            <p>
              {translate(
                "Selecione um bloco para mudar os dados, o formato e o estilo.",
              )}
            </p>
            <button className="primary-button" onClick={() => setGallery(true)}>
              <Plus size={16} /> {translate(" Adicionar visual ")}
            </button>
            <div className="editor-tips">
              <span>
                <GripVertical size={15} />{" "}
                {translate(" Arraste os blocos para organizar ")}
              </span>
              <span>
                <Palette size={15} /> {translate(" Personalize cada visual ")}
              </span>
              <span>
                <Eye size={15} /> {translate(" Veja como sua equipe verá ")}
              </span>
            </div>
          </div>
        )}
      </TabsContent>
      <TabsContent value="design">
        <div className="property-fields">
          <div className="inspector-label">
            {translate("IDENTIDADE DO PAINEL")}
          </div>
          <label>
            {translate(" Título do dashboard ")}
            <Input
              aria-label={translate("Título do painel")}
              value={config.title}
              maxLength={80}
              onChange={(e) => commit({ ...config, title: e.target.value })}
            />
          </label>
          <label>
            {translate(" Paleta de cores ")}
            <div className="theme-options">
              {PALETTES.map((p) => (
                <button
                  key={p.color}
                  aria-label={translate("Paleta {v0}", { v0: p.name })}
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
            {translate(" Cor da sua marca ")}
            <input
              className="brand-color"
              type="color"
              aria-label={translate("Cor da marca")}
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
            {translate(" Fundo do painel ")}
            <Choice
              label={translate("Fundo do painel")}
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
            {translate(" Espaçamento ")}
            <Choice
              label={translate("Espaçamento")}
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
            {translate(" Cantos arredondados ")}
            <Switch
              aria-label={translate("Cantos arredondados")}
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
            <LayoutTemplate size={16} />{" "}
            {translate(" Trocar modelo do painel ")}
          </button>
          <p className="property-hint">
            {translate(
              " A paleta é aplicada aos visuais sem uma cor individual. Todas as alterações são guardadas ao salvar o dashboard. ",
            )}
          </p>
        </div>
      </TabsContent>
      <TabsContent value="assistant">
        <div className="property-fields assistant-builder">
          <span className="mode-label">{translate("COMANDOS GUIADOS")}</span>
          <h3>{translate("Dê forma à sua ideia.")}</h3>
          <p>
            {translate(
              "Peça um novo visual e continue personalizando no editor.",
            )}
          </p>
          {[
            translate("Adicione uma rosca de {v0} por {v1}", {
              v0: config.metric,
              v1: config.dimension,
            }),
            translate("Adicione um indicador de média de {v0}", {
              v0: config.metric,
            }),
            "Adicione uma tabela",
          ].map((t) => (
            <button key={t} className="suggestion" onClick={() => ask(t)}>
              {translate(t)}
              <ArrowRight size={14} />
            </button>
          ))}
          {answer && (
            <div className="builder-answer" role="status">
              {translate(answer)}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <textarea
              aria-label={translate("Pedido ao assistente")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={translate("Adicione um gráfico de…")}
              maxLength={1200}
              rows={4}
            />
            <button
              className="primary-button"
              disabled={!prompt.trim()}
              type="submit"
            >
              {translate(" Aplicar pedido ")}
              <ArrowUp size={15} />
            </button>
          </form>
          <p className="property-hint">
            {translate(
              " IA generativa ainda não conectada. O editor visual funciona independentemente dela. ",
            )}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
  return (
    <section
      className="editor-shell"
      aria-label={translate("Editor de dashboards")}
    >
      <div className="editor-topbar" data-tour="editor-tools">
        <div className="editor-state">
          <span className="editor-mode">
            {editing ? <Pencil size={13} /> : <Eye size={13} />}{" "}
            {editing ? translate("MODO DE EDIÇÃO") : translate("VISUALIZAÇÃO")}
          </span>
          <span>
            {visuals.length} {translate(" visuais")}
          </span>
        </div>
        <div className="editor-top-actions" data-tour="chart-tools">
          {editing && (
            <>
              <button
                className="secondary-button prepare-data-button"
                onClick={() => setDataOpen(true)}
              >
                <Database size={16} /> {translate(" Preparar dados ")}
              </button>
              <button
                className="editor-icon"
                aria-label={translate("Desfazer")}
                disabled={!past.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="editor-icon"
                aria-label={translate("Refazer")}
                disabled={!future.length}
                onClick={redo}
              >
                <Redo2 size={17} />
              </button>
              <span className="toolbar-separator" />
              <button
                className="secondary-button"
                aria-label={translate("Modelos")}
                onClick={() => setTemplates(true)}
              >
                <LayoutTemplate size={16} />
                <span>{translate("Modelos")}</span>
              </button>
              <button
                className="secondary-button"
                aria-label={translate("Estilo")}
                onClick={() => openPanel("design")}
              >
                <Palette size={16} />
                <span>{translate("Estilo")}</span>
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
            {editing ? translate("Visualizar") : translate("Editar painel")}
          </button>
          {editing && (
            <button
              className="primary-button"
              disabled={visuals.length >= 24}
              onClick={() => setGallery(true)}
            >
              <Plus size={16} /> {translate(" Adicionar visual ")}
            </button>
          )}
        </div>
      </div>
      <div className="analysis-launch">
        <button onClick={() => setHubOpen(true)}>
          <Microscope size={18} />
          <span>
            <strong>{translate("Explorar e analisar")}</strong>
            <small>
              {translate("Tabela dinâmica, destaques e qualidade dos dados")}
            </small>
          </span>
          <ArrowRight size={18} />
        </button>
        <span>
          {translate(
            " Clique em Explorar nos visuais para investigar os registros. ",
          )}
        </span>
      </div>
      <BookmarkBar config={config} onChange={commit} />
      <div className="editor-filterbar">
        <div className="source-chip">
          <Database size={14} />
          <span>
            {source.demo ? translate("Base de demonstração") : source.name}
          </span>
        </div>
        <Choice
          label={translate("Período do painel")}
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
              label={translate("Campo do filtro")}
              value={filterField}
              onChange={(v) => {
                setFilterField(v);
                if (config.filter) commit({ ...config, filter: undefined });
              }}
              items={dimensions.map((c) => ({ raw: true, value: c, label: c }))}
            />
            <Choice
              label={translate("Valor do filtro")}
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
                ...filterValues.map((v) => ({
                  raw: true,
                  value: `value:${v}`,
                  label: v,
                })),
              ]}
            />
          </>
        )}
        <button
          className="secondary-button"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal size={15} /> {translate(" Filtros avançados")}{" "}
          {config.filters?.rules.length
            ? `(${config.filters.rules.length})`
            : ""}
        </button>
        <button className="text-button" onClick={() => setTable(true)}>
          <Table2 size={15} /> {translate(" Dados ")}
        </button>
        <span className="row-count">
          {rows.length.toLocaleString(locale())} {translate(" registros ")}
        </span>
      </div>
      {prepared.error && (
        <div className="model-error" role="alert">
          {translate(prepared.error)}
        </div>
      )}
      {config.dataSteps?.length ? (
        <div className="model-applied-banner">
          <Database size={14} />
          {config.dataSteps.length}{" "}
          {translate(" etapas de preparação aplicadas ·")}{" "}
          {source.columns.length} {translate(" colunas disponíveis ")}
          <button onClick={() => setDataOpen(true)}>
            {translate("Ver preparação")}
          </button>
        </div>
      ) : null}
      {config.filter && (
        <div className="active-filter">
          {config.filter.field}: <strong>{config.filter.value}</strong>
          <button
            aria-label={translate("Limpar filtro")}
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
            <span>
              {editing ? translate("ÁREA DO DASHBOARD") : config.title}
            </span>
            <span>
              {source.demo
                ? translate("DADOS DE EXEMPLO")
                : translate("DADOS DA SUA EMPRESA")}
            </span>
          </div>
          {editing && (
            <div className="layout-feedback">
              <span>
                {translate(
                  "Clique e arraste o gráfico para trocar de posição. No celular, segure antes de arrastar. Use o canto para redimensionar.",
                )}
              </span>
              <b role="status">
                {resize.preview
                  ? translate("{v0}/12 colunas · {v1}px", {
                      v0: resize.preview.span,
                      v1: resize.preview.height,
                    })
                  : drag.active
                    ? translate("Solte sobre outro gráfico · Esc cancela")
                    : translate("Teclado: setas nos controles")}
              </b>
            </div>
          )}
          <div className="visual-grid" ref={drag.grid}>
            {orderedVisuals.map((v, index) => (
              <article
                key={v.id}
                data-visual-drop
                data-drop-id={v.id}
                {...(editing ? drag.bind(v.id) : {})}
                className={`visual-card span-${resize.preview?.id === v.id ? resize.preview.span : v.span} ${editing && selectedId === v.id ? "is-selected" : ""} ${drag.active === v.id ? "pointer-dragging" : ""} ${resize.preview?.id === v.id ? "resize-active" : ""}`}
                style={{
                  minHeight:
                    resize.preview?.id === v.id
                      ? resize.preview.height
                      : v.height,
                  height:
                    v.type === "text"
                      ? "auto"
                      : resize.preview?.id === v.id
                        ? resize.preview.height
                        : v.height,
                }}
              >
                <div className="visual-card-heading">
                  <div className="visual-title-wrap">
                    {editing && (
                      <button
                        className="drag-handle"
                        aria-label={translate("Arrastar {v0}", { v0: v.title })}
                        title={translate(
                          "Arraste ou use as setas para reorganizar",
                        )}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                            e.preventDefault();
                            move(v.id, -1);
                          } else if (
                            e.key === "ArrowDown" ||
                            e.key === "ArrowRight"
                          ) {
                            e.preventDefault();
                            move(v.id, 1);
                          }
                        }}
                      >
                        <GripVertical size={16} />
                      </button>
                    )}
                    <div>
                      <h3>{v.title || translate("Visual sem título")}</h3>
                      {v.subtitle && (
                        <p className="visual-subtitle">{v.subtitle}</p>
                      )}
                    </div>
                  </div>
                  {v.type !== "text" && (
                    <button
                      className="visual-edit"
                      aria-label={translate("Explorar {v0}", { v0: v.title })}
                      title={translate("Explorar registros")}
                      onClick={() => setDrill({ visual: v, selections: [] })}
                    >
                      <Search size={15} />
                    </button>
                  )}
                  {editing && (
                    <button
                      className={`visual-edit ${selectedId === v.id ? "active" : ""}`}
                      aria-label={translate("Editar {v0}", { v0: v.title })}
                      onClick={() => select(v.id)}
                    >
                      <SlidersHorizontal size={15} />
                      <span className="configure-label">
                        {translate("Configurar")}
                      </span>
                    </button>
                  )}
                </div>
                <div
                  className="visual-content"
                  onClick={editing ? () => select(v.id) : undefined}
                  style={{ cursor: editing ? "grab" : undefined }}
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
                      {translate(
                        VISUAL_TYPES.find((t) => t.type === v.type)?.label ||
                          "",
                      )}{" "}
                      {v.type !== "text" && `· ${v.metric}`}
                    </span>
                    <div>
                      <button
                        aria-label={translate("Mover {v0} antes", {
                          v0: v.title,
                        })}
                        disabled={index === 0}
                        onClick={() => move(v.id, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        aria-label={translate("Mover {v0} depois", {
                          v0: v.title,
                        })}
                        disabled={index === visuals.length - 1}
                        onClick={() => move(v.id, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        aria-label={translate("Duplicar {v0}", { v0: v.title })}
                        disabled={visuals.length >= 24}
                        onClick={() => duplicate(v)}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                )}
                {editing && (
                  <button
                    className="visual-resize"
                    aria-label={translate("Redimensionar {v0}", {
                      v0: v.title,
                    })}
                    title={translate(
                      "Arraste para ajustar largura e altura; ou use as setas",
                    )}
                    {...resize.handle(v)}
                  >
                    <MoveDiagonal2 size={15} />
                  </button>
                )}
              </article>
            ))}
          </div>
          {!visuals.length && (
            <div className="blank-canvas">
              <span>
                <LayoutTemplate size={34} />
              </span>
              <h2>{translate("Comece com uma ideia.")}</h2>
              <p>
                {translate(
                  " Adicione os indicadores e gráficos que fazem sentido para o seu negócio. ",
                )}
              </p>
              {editing && (
                <button
                  className="primary-button"
                  onClick={() => setGallery(true)}
                >
                  <Plus size={17} />{" "}
                  {translate(" Escolher meu primeiro visual ")}
                </button>
              )}
            </div>
          )}
          {editing && visuals.length > 0 && visuals.length < 24 && (
            <button className="add-block" onClick={() => setGallery(true)}>
              <Plus size={18} />{" "}
              {translate(" Adicionar um novo visual ao painel ")}
            </button>
          )}
          {!editing && (
            <p className="presentation-hint">
              {translate(
                " Clique em um gráfico para explorar os registros e aplicar o recorte ao painel. ",
              )}
            </p>
          )}
        </div>
        {editing && !small && (
          <aside className="visual-inspector">
            <div className="inspector-heading">
              <SlidersHorizontal size={17} />
              <strong>{translate("Personalização")}</strong>
            </div>
            {inspector}
          </aside>
        )}
      </div>
      <Sheet open={small && panelOpen && editing} onOpenChange={setPanelOpen}>
        <SheetContent className="editor-sheet">
          <SheetHeader>
            <SheetTitle>{translate("Personalizar dashboard")}</SheetTitle>
            <SheetDescription>
              {translate(
                " Altere o visual selecionado ou o estilo do painel. ",
              )}
            </SheetDescription>
          </SheetHeader>
          {inspector}
          <button
            className="primary-button sheet-done"
            onClick={() => setPanelOpen(false)}
          >
            {translate(" Voltar ao painel ")}
            <Check size={16} />
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
            <DialogTitle>
              {translate("Qual história seus dados contam?")}
            </DialogTitle>
            <DialogDescription>
              {translate(
                " Escolha um visual. Depois, ajuste os dados e deixe com a sua cara. ",
              )}
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
                  <strong>{translate(t.label)}</strong>
                  <small>{translate(t.description)}</small>
                  <Plus size={15} className="type-plus" />
                </button>
              );
            })}
          </div>
          <p className="property-hint">
            {translate(
              " Cada visual pode usar um indicador, um cálculo e um agrupamento diferente. ",
            )}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={templates} onOpenChange={setTemplates}>
        <DialogContent className="app-dialog template-dialog">
          <DialogHeader>
            <DialogTitle>
              {translate("Um ponto de partida para sua análise")}
            </DialogTitle>
            <DialogDescription>
              {translate(
                " O modelo substitui os blocos atuais. Você pode desfazer a troca. ",
              )}
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
                <strong>{translate(t.title)}</strong>
                <span>{translate(t.desc)}</span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={table} onOpenChange={setTable}>
        <DialogContent className="app-dialog wide-dialog">
          <DialogHeader>
            <DialogTitle>{translate("Dados deste painel")}</DialogTitle>
            <DialogDescription>
              {rows.length}{" "}
              {translate(" registros após os filtros de período e categoria. ")}
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
            <Download size={16} /> {translate(" Exportar dados filtrados ")}
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
