"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  Database,
  Download,
  Sparkles,
  Check,
  SlidersHorizontal,
  Table2,
  BarChart3,
  LineChart,
  Undo2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analytics,
  formatValue,
  interpretRequest,
  parseDate,
  toCSV,
  type Config,
  type Source,
} from "@/lib/analytics";

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Choice({
  label,
  value,
  onChange,
  items,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const shortDate = (value: string) => {
  const t = parseDate(value);
  return t !== null
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(t)
    : value.length > 15
      ? value.slice(0, 13) + "…"
      : value;
};

export function DataPreview({
  source,
  limit = 6,
}: {
  source: Source;
  limit?: number;
}) {
  return (
    <div className="data-preview">
      <Table>
        <TableHeader>
          <TableRow>
            {source.columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {source.rows.slice(0, limit).map((row, i) => (
            <TableRow key={i}>
              {source.columns.map((c) => (
                <TableCell key={c}>{row[c] || "—"}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p>
        Prévia de {Math.min(limit, source.rows.length)} de{" "}
        {source.rows.length.toLocaleString("pt-BR")} registros.
      </p>
    </div>
  );
}

export function AnalyticsStudio({
  source,
  config,
  onChange,
}: {
  source: Source;
  config: Config;
  onChange: (c: Config) => void;
}) {
  const data = useMemo(() => analytics(source, config), [source, config]);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [settings, setSettings] = useState(false),
    [table, setTable] = useState(false);
  const [history, setHistory] = useState<Config[]>([]);
  const [mounted, setMounted] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (chatRef.current)
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);
  const change = (next: Config) => {
    setHistory((h) => [...h.slice(-19), config]);
    onChange(next);
  };
  const submit = (text = prompt) => {
    if (!text.trim()) return;
    const result = interpretRequest(text.slice(0, 1200), source, config);
    if (result.changed) change(result.config);
    setMessages((m) => [
      ...m.slice(-18),
      { role: "user", text: text.trim() },
      { role: "assistant", text: result.message },
    ]);
    setPrompt("");
  };
  const unit = config.aggregation === "count" ? "Registros" : config.metric;
  const mode =
    config.aggregation === "average"
      ? "Média"
      : config.aggregation === "count"
        ? "Registros"
        : "Total";
  const top = data.ranked[0];
  const suggestion = [
    `Mostre ${config.metric} por ${config.dimension}`,
    "Calcule a média",
    config.chart === "bar"
      ? "Mostre a evolução em linha"
      : "Crie um gráfico de barras",
  ];
  const chartTitle =
    config.chart === "bar"
      ? `${mode} por ${config.dimension}`
      : data.timeKey
        ? `Evolução de ${config.metric}`
        : `${mode} por ${config.dimension}`;
  const chartProps = {
    data: data.series,
    margin: { top: 8, right: 12, left: 0, bottom: 4 },
  };
  const chartChildren = (
    <>
      <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e6ecea" />
      <XAxis
        dataKey="name"
        tickFormatter={shortDate}
        axisLine={false}
        tickLine={false}
        minTickGap={24}
        tick={{ fill: "#6f8176", fontSize: 12 }}
        dy={8}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tickFormatter={(v) => formatValue(v, unit, true)}
        width={62}
        tick={{ fill: "#6f8176", fontSize: 12 }}
      />
      <Tooltip
        formatter={(v) => [formatValue(Number(v), unit), mode]}
        labelFormatter={(v) => shortDate(String(v))}
        contentStyle={{
          borderRadius: 10,
          border: "1px solid #dce7df",
          fontSize: 13,
        }}
      />
    </>
  );
  return (
    <div className="studio-layout">
      <section className="dashboard-surface" aria-label="Painel de análise">
        <div className="dashboard-toolbar">
          <span className="demo-label">
            <Database size={13} />
            {source.demo ? "Dados de demonstração" : source.name}
          </span>
          <div className="toolbar-actions">
            <button
              className="text-button"
              aria-label="Personalizar análise"
              onClick={() => setSettings(true)}
            >
              <SlidersHorizontal size={16} />
              <span>Personalizar</span>
            </button>
            <button
              className="text-button"
              aria-label="Exportar CSV filtrado"
              onClick={() =>
                downloadFile(
                  "drivedata-dados.csv",
                  toCSV(source, data.rows),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={16} />
              <span>CSV</span>
            </button>
          </div>
        </div>
        <div className="metrics">
          {[
            {
              label: `Total · ${config.metric}`,
              value: formatValue(data.total, config.metric, true),
              caption: "Soma dos valores preenchidos",
            },
            {
              label: "Registros analisados",
              value: data.rows.length.toLocaleString("pt-BR"),
              caption:
                config.period === "all"
                  ? "Todos os registros da base"
                  : `Últimos ${config.period} dias da base`,
            },
            {
              label: `Média · ${config.metric}`,
              value: formatValue(data.average, config.metric, true),
              caption: `${data.valid.toLocaleString("pt-BR")} valores preenchidos`,
            },
          ].map(({ label, value, caption }, i) => (
            <article className="metric" key={i}>
              <div className="metric-label">
                {label}
                <ArrowUpRight size={16} />
              </div>
              <strong
                title={
                  i === 0
                    ? formatValue(data.total, config.metric)
                    : i === 2
                      ? formatValue(data.average, config.metric)
                      : value
                }
              >
                {value}
              </strong>
              <span>{caption}</span>
              <div
                className="metric-accent"
                style={{ width: `${45 + i * 17}%` }}
              />
            </article>
          ))}
        </div>
        <article className="chart-card">
          <div className="card-heading">
            <div>
              <h2>{chartTitle}</h2>
              <p>
                {config.chart === "bar"
                  ? `Até 12 grupos · ${config.aggregation === "average" ? "média dos valores" : config.aggregation === "count" ? "contagem de linhas" : "soma dos valores"}`
                  : data.timeKey
                    ? `Agrupado por ${data.timeKey} · ${mode.toLowerCase()}`
                    : "Sem coluna de data · agrupado por categoria"}
              </p>
            </div>
            <Tabs
              value={config.chart}
              onValueChange={(v) =>
                change({ ...config, chart: v as Config["chart"] })
              }
            >
              <TabsList>
                <TabsTrigger value="area" aria-label="Gráfico de linha">
                  <LineChart size={16} />
                </TabsTrigger>
                <TabsTrigger value="bar" aria-label="Gráfico de barras">
                  <BarChart3 size={16} />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div
            className="main-chart"
            role="img"
            aria-label={`${chartTitle}. ${data.series.length} grupos. Valores detalhados em Ver dados.`}
          >
            {mounted && data.series.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={{ width: 600, height: 250 }}
              >
                {config.chart === "bar" ? (
                  <BarChart {...chartProps}>
                    {chartChildren}
                    <Bar
                      dataKey="value"
                      fill="#19a579"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={42}
                      isAnimationActive={false}
                    />
                  </BarChart>
                ) : (
                  <AreaChart {...chartProps}>
                    {chartChildren}
                    <defs>
                      <linearGradient
                        id="revenueFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#10a879"
                          stopOpacity={0.23}
                        />
                        <stop
                          offset="100%"
                          stopColor="#10a879"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#0b9b72"
                      fill="url(#revenueFill)"
                      strokeWidth={2.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart">
                {mounted
                  ? "Nenhum registro neste período."
                  : "Preparando gráfico…"}
              </div>
            )}
          </div>
          <div className="chart-footer">
            <Choice
              label="Período da análise"
              value={config.period}
              disabled={!source.dates.length}
              onChange={(v) =>
                change({ ...config, period: v as Config["period"] })
              }
              items={[
                { value: "all", label: "Todo o período" },
                { value: "30", label: "Últimos 30 dias da base" },
                { value: "90", label: "Últimos 90 dias da base" },
              ]}
            />
            <button className="text-button" onClick={() => setTable(true)}>
              <Table2 size={15} /> Ver dados
            </button>
          </div>
        </article>
        <div className="bottom-grid">
          <article className="chart-card">
            <div className="card-heading">
              <h2>
                {mode} por {config.dimension}
              </h2>
              <span className="subtle">Top 5</span>
            </div>
            {data.ranked.slice(0, 5).map((row) => (
              <div className="rank-row" key={row.name}>
                <div>
                  <span title={row.name}>{row.name}</span>
                  <small>{formatValue(row.value, unit, true)}</small>
                </div>
                <div className="rank-track">
                  <i
                    style={{
                      width: `${(Math.abs(row.value) / Math.max(1, ...data.ranked.map((r) => Math.abs(r.value)))) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {data.ranked.length === 0 && (
              <p className="subtle">Não há grupos neste período.</p>
            )}
          </article>
          <article className="insight-card">
            <span className="insight-icon">
              <Sparkles size={20} />
            </span>
            <span className="eyebrow">DESTAQUE DA BASE</span>
            <h2>{top?.name || "Sem resultados"}</h2>
            <p>
              {top ? (
                <>
                  Tem o maior resultado de{" "}
                  <strong>{formatValue(top.value, unit)}</strong> entre os
                  grupos de {config.dimension.toLowerCase()}, usando{" "}
                  {mode.toLowerCase()}.
                </>
              ) : (
                "Selecione outro período para continuar a análise."
              )}
            </p>
            <span className="insight-bottom">
              Calculado com os dados selecionados
            </span>
            {data.missing > 0 && (
              <p>{data.missing} valores vazios excluídos da soma e da média.</p>
            )}
          </article>
        </div>
      </section>
      <aside className="assistant-panel" aria-label="Assistente de análises">
        <div className="assistant-header">
          <span className="assistant-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <h2>Assistente DriveData</h2>
            <span>Seu próximo insight começa aqui</span>
          </div>
        </div>
        <div className="assistant-body">
          <span className="mode-label">PRÉVIA · COMANDOS GUIADOS</span>
          {messages.length === 0 ? (
            <>
              <div className="assistant-greeting">
                <h3>
                  Vamos olhar para
                  <br /> os seus dados?
                </h3>
                <p>
                  Peça uma soma, uma média ou uma nova visão dos seus
                  resultados.
                </p>
              </div>
              <div className="context-pill">
                <Database size={14} />
                <span>{source.name}</span>
                <Check size={14} />
              </div>
              <span className="suggest-label">EXPERIMENTE UM PEDIDO</span>
              {suggestion.map((t) => (
                <button
                  key={t}
                  className="suggestion"
                  onClick={() => submit(t)}
                >
                  {t}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </>
          ) : (
            <div
              className="chat-messages"
              ref={chatRef}
              role="log"
              aria-live="polite"
            >
              {messages.map((m, i) => (
                <div className={`chat-message ${m.role}`} key={i}>
                  <span>{m.role === "user" ? "Você" : "DriveData"}</span>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <button
              className="text-button undo-button"
              onClick={() => {
                onChange(history[history.length - 1]);
                setHistory((h) => h.slice(0, -1));
                setMessages((m) => [
                  ...m,
                  { role: "assistant", text: "Última alteração desfeita." },
                ]);
              }}
            >
              <Undo2 size={14} /> Desfazer alteração
            </button>
          )}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            aria-label="Descreva sua análise"
            placeholder="O que você quer descobrir?"
            maxLength={1200}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div>
            <span>Enter para enviar</span>
            <button
              type="submit"
              aria-label="Enviar pedido"
              disabled={!prompt.trim()}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </form>
        <p className="assistant-footnote">
          IA generativa ainda não conectada.
          <br />
          Seus dados ficam neste navegador.
        </p>
      </aside>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>Personalizar análise</DialogTitle>
            <DialogDescription>
              Escolha os campos que fazem parte do seu painel.
            </DialogDescription>
          </DialogHeader>
          <div className="form-fields">
            <label>
              Indicador
              <Choice
                label="Indicador"
                value={config.metric}
                onChange={(v) => change({ ...config, metric: v })}
                items={source.numeric.map((c) => ({ value: c, label: c }))}
              />
            </label>
            <label>
              Agrupar por
              <Choice
                label="Agrupar por"
                value={config.dimension}
                onChange={(v) => change({ ...config, dimension: v })}
                items={source.columns.map((c) => ({ value: c, label: c }))}
              />
            </label>
            <label>
              Cálculo
              <Choice
                label="Cálculo"
                value={config.aggregation}
                onChange={(v) =>
                  change({ ...config, aggregation: v as Config["aggregation"] })
                }
                items={[
                  { value: "sum", label: "Soma" },
                  { value: "average", label: "Média dos valores preenchidos" },
                  { value: "count", label: "Contagem de registros" },
                ]}
              />
            </label>
          </div>
          <p className="subtle">
            Os cartões mostram o total, a quantidade de registros e a média. O
            cálculo selecionado se aplica aos gráficos.
          </p>
          <button className="primary-button" onClick={() => setSettings(false)}>
            Concluir
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={table} onOpenChange={setTable}>
        <DialogContent className="app-dialog wide-dialog">
          <DialogHeader>
            <DialogTitle>Dados da análise</DialogTitle>
            <DialogDescription>
              {source.name} · {data.rows.length} registros no período
              selecionado.
            </DialogDescription>
          </DialogHeader>
          <DataPreview source={{ ...source, rows: data.rows }} limit={50} />
          <button
            className="primary-button"
            onClick={() =>
              downloadFile(
                "drivedata-dados.csv",
                toCSV(source, data.rows),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={16} /> Exportar todos os registros filtrados
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
