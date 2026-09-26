"use client";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Database,
  Download,
  FunctionSquare,
  Plus,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Field, TextField, FilterBuilder } from "./model-controls";
import { downloadFile } from "./analytics-studio";
import {
  prepareSource,
  profileColumn,
  STEP_NAMES,
  type DataStep,
  type FilterSet,
} from "@/lib/data-model";
import { toCSV, type Source } from "@/lib/analytics";

export function DataStudio({
  original,
  steps,
  onApply,
  onClose,
}: {
  original: Source;
  steps: DataStep[];
  onApply: (steps: DataStep[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(steps),
    [selected, setSelected] = useState(original.columns[0]),
    [kind, setKind] = useState<DataStep["kind"]>("type");
  const [value, setValue] = useState("number"),
    [extra, setExtra] = useState(""),
    [name, setName] = useState(""),
    [keys, setKeys] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterSet>({ mode: "and", rules: [] });
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<{ field: string; desc: boolean } | null>(null),
    [error, setError] = useState("");
  const prepared = useMemo(
      () => prepareSource(original, draft),
      [original, draft],
    ),
    source = prepared.source;
  const field = source.columns.includes(selected)
    ? selected
    : source.columns[0];
  const profile = useMemo(() => profileColumn(source, field), [source, field]);
  const viewed = useMemo(() => {
    let rows = source.rows;
    if (query)
      rows = rows.filter((r) =>
        source.columns.some((c) =>
          r[c]?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        ),
      );
    if (sort)
      rows = [...rows].sort(
        (a, b) =>
          (a[sort.field] ?? "").localeCompare(b[sort.field] ?? "", "pt-BR", {
            numeric: true,
          }) * (sort.desc ? -1 : 1),
      );
    return rows;
  }, [source, query, sort]);
  const pages = Math.max(1, Math.ceil(viewed.length / 30)),
    activePage = Math.min(page, pages - 1);
  const candidate: DataStep = {
    id: "candidate",
    kind,
    field: ["calculate", "conditional"].includes(kind) ? name : field,
    value,
    extra: kind === "datepart" ? name : extra,
    fields: keys,
    filters,
  };
  const candidatePreview = useMemo(
    () => prepareSource(original, [...draft, candidate]),
    [original, draft, kind, field, value, extra, name, keys, filters],
  );
  function changeKind(next: DataStep["kind"]) {
    setKind(next);
    setValue(next === "type" ? "number" : next === "datepart" ? "month" : "");
    setExtra("");
    setError("");
  }
  function append() {
    if (candidatePreview.error) {
      setError(candidatePreview.error);
      return;
    }
    setDraft([...draft, { ...candidate, id: crypto.randomUUID() }]);
    if (kind === "rename") setSelected(value.trim());
    if (["calculate", "conditional", "datepart"].includes(kind))
      setSelected(name.trim());
    setError("");
    setPage(0);
  }
  const type = source.numeric.includes(field)
    ? "Número"
    : source.dates.includes(field)
      ? "Data"
      : "Texto";
  const last = candidatePreview.reports.at(-1);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="model-dialog data-studio">
        <DialogHeader className="model-header">
          <div className="model-eyebrow">
            <Database size={16} /> PREPARAÇÃO DE DADOS
          </div>
          <DialogTitle>Do arquivo à análise.</DialogTitle>
          <DialogDescription>
            {original.name} · Transformações deste dashboard. O arquivo original
            permanece preservado.
          </DialogDescription>
        </DialogHeader>
        <div className="data-toolbar">
          <div className="data-stats">
            <strong>{source.rows.length.toLocaleString("pt-BR")}</strong> linhas{" "}
            <span /> <strong>{source.columns.length}</strong> colunas <span />{" "}
            <strong>{draft.length}</strong> etapas
          </div>
          <button
            className="secondary-button"
            disabled={!draft.length}
            onClick={() => {
              setDraft(draft.slice(0, -1));
              setError("");
            }}
            aria-label="Desfazer etapa de preparação"
          >
            <Undo2 size={15} /> Desfazer etapa
          </button>
          <label className="table-search">
            <Search size={15} />
            <input
              aria-label="Buscar na prévia dos dados"
              placeholder="Buscar na prévia…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() =>
              downloadFile(
                "dados-preparados.csv",
                toCSV(source),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={15} /> Exportar resultado
          </button>
        </div>
        <div className="data-studio-body">
          <aside className="steps-panel">
            <div className="model-section-label">
              ETAPAS APLICADAS <span>{draft.length}</span>
            </div>
            <div className="source-step">
              <Database size={17} />
              <div>
                <strong>Arquivo original</strong>
                <small>{original.rows.length} linhas</small>
              </div>
            </div>
            {!draft.length && (
              <p className="model-note">
                Cada alteração aparece aqui. Remova a última etapa para voltar
                ao resultado anterior.
              </p>
            )}
            {draft.map((step, index) => (
              <div
                className={`applied-step ${prepared.error && index === prepared.reports.length ? "failed" : ""}`}
                key={step.id}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{STEP_NAMES[step.kind]}</strong>
                  <small>
                    {step.kind === "calculate"
                      ? `${step.field} = ${step.value}`
                      : step.field || "Todas as colunas"}
                  </small>
                  <small>
                    {prepared.reports[index]?.after ?? "—"} linhas
                    {prepared.reports[index]?.invalid
                      ? ` · ${prepared.reports[index].invalid} vazios gerados`
                      : ""}
                  </small>
                </div>
                {index === draft.length - 1 && (
                  <button
                    aria-label="Desfazer última etapa"
                    onClick={() => {
                      setDraft(draft.slice(0, -1));
                      setError("");
                    }}
                  >
                    <Undo2 size={15} />
                  </button>
                )}
              </div>
            ))}
            <div className="steps-explainer">
              As etapas são executadas em ordem e salvas junto com o dashboard.
            </div>
          </aside>
          <div className="data-grid-panel">
            <div className="data-grid-help">
              Selecione uma coluna para tratar seus valores. Clique em uma
              célula para editá-la.
            </div>
            <div className="data-grid-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="row-number">#</th>
                    {source.columns.map((c) => (
                      <th
                        className={field === c ? "selected-column" : ""}
                        key={c}
                      >
                        <button onClick={() => setSelected(c)}>
                          <span className="column-type">
                            {source.numeric.includes(c)
                              ? "123"
                              : source.dates.includes(c)
                                ? "DATA"
                                : "ABC"}
                          </span>
                          {c}
                        </button>
                        <button
                          aria-label={`Ordenar prévia por ${c}`}
                          onClick={() =>
                            setSort({
                              field: c,
                              desc: sort?.field === c ? !sort.desc : false,
                            })
                          }
                        >
                          <ChevronDown size={13} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewed
                    .slice(activePage * 30, activePage * 30 + 30)
                    .map((row, index) => (
                      <tr key={`${activePage}-${index}`}>
                        <td className="row-number">
                          {activePage * 30 + index + 1}
                        </td>
                        {source.columns.map((c) => (
                          <td
                            className={field === c ? "selected-column" : ""}
                            key={c}
                          >
                            <button
                              title={row[c] || "Vazio"}
                              aria-label={`Editar ${c}, linha ${activePage * 30 + index + 1}`}
                              onClick={() => {
                                setSelected(c);
                                setKind("edit");
                                setValue(row[c] ?? "");
                                setExtra(String(source.rows.indexOf(row)));
                                setError("");
                              }}
                            >
                              {row[c] || <em>vazio</em>}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
              {!viewed.length && (
                <div className="model-empty">Nenhuma linha nesta prévia.</div>
              )}
            </div>
            <div className="data-pagination">
              <span>
                {viewed.length} linhas na busca · página {activePage + 1} de{" "}
                {pages}
              </span>
              <button
                aria-label="Página anterior dos dados"
                disabled={activePage === 0}
                onClick={() => setPage(activePage - 1)}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                aria-label="Próxima página dos dados"
                disabled={activePage >= pages - 1}
                onClick={() => setPage(activePage + 1)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="column-profile">
              <div>
                <span>COLUNA SELECIONADA</span>
                <strong>{field}</strong>
                <small>{type}</small>
              </div>
              <div>
                <strong>{profile.distinct}</strong>
                <span>valores distintos</span>
              </div>
              <div>
                <strong>{profile.empty}</strong>
                <span>vazios</span>
              </div>
              <div>
                <strong>{profile.invalid}</strong>
                <span>inválidos para o tipo</span>
              </div>
              <div className="profile-values">
                {profile.top.map(([v, n]) => (
                  <span key={v} title={v}>
                    {v || "(vazio)"} <b>{n}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <aside className="transform-panel">
            <div className="model-section-label">
              <FunctionSquare size={15} /> TRANSFORMAR DADOS
            </div>
            <Field
              label="Operação"
              value={kind}
              onChange={(v) => changeKind(v as DataStep["kind"])}
              options={Object.entries(STEP_NAMES)
                .filter(([key]) => key !== "edit" || kind === "edit")
                .map(([value, label]) => ({ value, label }))}
            />
            {!["calculate", "conditional", "deduplicate", "filter"].includes(
              kind,
            ) && (
              <Field
                label="Coluna da transformação"
                value={field}
                onChange={setSelected}
                options={source.columns.map((c) => ({ value: c, label: c }))}
              />
            )}
            <div className="transform-fields">
              {kind === "type" && (
                <>
                  <Field
                    label="Novo tipo"
                    value={value}
                    onChange={setValue}
                    options={[
                      { value: "number", label: "Número decimal" },
                      { value: "text", label: "Texto" },
                      { value: "date", label: "Data" },
                    ]}
                  />
                  <p className="model-note">
                    Números aceitam vírgula ou ponto decimal. Datas: DD/MM/AAAA
                    ou AAAA-MM-DD. Valores incompatíveis tornam-se vazios; a
                    contagem aparece antes de aplicar.
                  </p>
                </>
              )}
              {kind === "rename" && (
                <TextField
                  label="Novo nome da coluna"
                  value={value}
                  onChange={setValue}
                />
              )}{" "}
              {kind === "fill" && (
                <TextField
                  label="Preencher vazios com"
                  value={value}
                  onChange={setValue}
                />
              )}{" "}
              {kind === "edit" && (
                <>
                  <div className="model-note">
                    Linha {Number(extra) + 1} do resultado atual. A edição fica
                    registrada como uma etapa.
                  </div>
                  <TextField
                    label="Novo valor da célula"
                    value={value}
                    onChange={setValue}
                  />
                </>
              )}{" "}
              {kind === "replace" && (
                <>
                  <TextField
                    label="Valor exato a localizar"
                    value={value}
                    onChange={setValue}
                  />
                  <TextField
                    label="Substituir por"
                    value={extra}
                    onChange={setExtra}
                  />
                  <p className="model-note">
                    Substituição do conteúdo completo da célula, com distinção
                    de maiúsculas.
                  </p>
                </>
              )}{" "}
              {kind === "calculate" && (
                <>
                  <TextField
                    label="Nome da coluna calculada"
                    value={name}
                    onChange={setName}
                    placeholder="Ex.: Lucro"
                  />
                  <label className="model-field">
                    <span>Fórmula por linha</span>
                    <textarea
                      aria-label="Fórmula da coluna calculada"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="[Receita] - [Custo]"
                      rows={4}
                    />
                  </label>
                  <div className="formula-fields">
                    {source.numeric.map((c) => (
                      <button
                        key={c}
                        onClick={() => setValue((v) => `${v}[${c}]`)}
                      >
                        {c} <Plus size={11} />
                      </button>
                    ))}
                  </div>
                  <p className="model-note">
                    Use +, −, *, / e parênteses. Ex.: ([Receita] - [Custo]) /
                    [Receita]. A fórmula é calculada em cada linha. Vazios e
                    divisão por zero resultam em vazio; não equivalem à razão
                    entre totais.
                  </p>
                </>
              )}{" "}
              {kind === "conditional" && (
                <>
                  <TextField
                    label="Nome da coluna condicional"
                    value={name}
                    onChange={setName}
                    placeholder="Ex.: Faixa de venda"
                  />
                  <FilterBuilder
                    source={source}
                    value={filters}
                    onChange={setFilters}
                  />
                  <TextField
                    label="Se atender às condições"
                    value={value}
                    onChange={setValue}
                    placeholder="Ex.: Alto valor"
                  />
                  <TextField
                    label="Senão"
                    value={extra}
                    onChange={setExtra}
                    placeholder="Ex.: Padrão"
                  />
                  <p className="model-note">
                    Cria uma categoria de texto por linha. Combine condições com
                    E ou OU.
                  </p>
                </>
              )}
              {kind === "datepart" && (
                <>
                  <TextField
                    label="Nome da coluna de período"
                    value={name}
                    onChange={setName}
                    placeholder="Ex.: Mês da venda"
                  />
                  <Field
                    label="Período a extrair"
                    value={value}
                    onChange={setValue}
                    options={[
                      { value: "year", label: "Ano" },
                      { value: "month", label: "Ano e mês" },
                      { value: "quarter", label: "Ano e trimestre" },
                      { value: "weekday", label: "Dia da semana" },
                    ]}
                  />
                  <p className="model-note">
                    A data original é preservada. Datas inválidas ficam vazias
                    na nova coluna.
                  </p>
                </>
              )}
              {kind === "deduplicate" && (
                <>
                  <p className="model-note">
                    Selecione as colunas que identificam uma duplicação. Sem
                    seleção, compara todas. Mantém a primeira linha.
                  </p>
                  <div className="column-checklist">
                    {source.columns.map((c) => (
                      <label key={c}>
                        <input
                          type="checkbox"
                          checked={keys.includes(c)}
                          onChange={(e) =>
                            setKeys(
                              e.target.checked
                                ? [...keys, c]
                                : keys.filter((k) => k !== c),
                            )
                          }
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </>
              )}{" "}
              {kind === "filter" && (
                <FilterBuilder
                  source={source}
                  value={filters}
                  onChange={setFilters}
                />
              )}{" "}
              {["trim", "upper", "lower"].includes(kind) && (
                <p className="model-note">
                  Aplica {STEP_NAMES[kind].toLocaleLowerCase()} aos valores
                  desta coluna.
                </p>
              )}
            </div>
            {!candidatePreview.error && (
              <div className="step-preview">
                <Check size={16} />
                <div>
                  <strong>Prévia da etapa</strong>
                  <span>
                    {candidatePreview.source.rows.length} linhas após aplicar
                    {last?.invalid
                      ? ` · ${last.invalid} valores ficarão vazios`
                      : ""}
                  </span>
                  {kind === "calculate" && (
                    <small>
                      Primeiros resultados:{" "}
                      {candidatePreview.source.rows
                        .slice(0, 3)
                        .map((r) => r[name.trim()] || "vazio")
                        .join(" · ")}
                    </small>
                  )}
                </div>
              </div>
            )}
            {(error || prepared.error) && (
              <div className="model-error" role="alert">
                {error || prepared.error}
              </div>
            )}
            <button
              className="primary-button"
              disabled={!!prepared.error || draft.length >= 60}
              onClick={append}
            >
              <Plus size={15} /> Adicionar etapa
            </button>
            <p className="model-note">
              Confira a prévia antes de aplicar. As alterações ficam apenas
              neste rascunho até confirmar abaixo.
            </p>
          </aside>
        </div>
        <div className="model-footer">
          <span>
            {prepared.error
              ? "Revise a etapa com erro."
              : `${draft.length} etapas · ${source.rows.length} linhas no resultado`}
          </span>
          <button className="secondary-button" onClick={onClose}>
            Cancelar alterações
          </button>
          <button
            className="primary-button"
            disabled={!!prepared.error}
            onClick={() => onApply(draft)}
          >
            <Check size={16} /> Aplicar ao dashboard
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
