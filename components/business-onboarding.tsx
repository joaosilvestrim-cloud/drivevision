"use client";
import { useEffect, useMemo, useState } from "react";
import { t as translate, locale, getLanguage } from "@/lib/i18n";
import {
  SEGMENTS,
  KNOWLEDGE_LEVELS,
  OBJECTIVES,
  ROLES,
  EMPTY_PROFILE,
  suggestMapping,
  inspectBusinessSource,
  buildBusinessDashboard,
  salesTemplate,
  type BusinessProfile,
  type BusinessContext,
  type Role,
} from "@/lib/business-onboarding";
import type { Source, Config } from "@/lib/analytics";
import { Field } from "./model-controls";
import { VisualChart } from "./chart-renderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function translateBusinessVisuals(base: Config): Config {
  return {
    ...base,
    visuals: base.visuals?.map((v) => {
      const ranking = v.title.match(/^(Vendas|Registros|Total) por (.+)$/);
      const title = ranking
        ? translate(
            ranking[1] === "Vendas" ? "Vendas por {v0}" : ranking[1] === "Total" ? "Total por {v0}" : "Registros por {v0}",
            { v0: ranking[2] },
          )
        : translate(v.title);
      return {
        ...v,
        title,
        measures: v.measures?.map((m) => ({ ...m, label: title })),
      };
    }),
  };
}

export function BusinessProfileFields({
  value,
  onChange,
  templates = false,
}: {
  value: BusinessProfile;
  onChange: (p: BusinessProfile) => void;
  templates?: boolean;
}) {
  function download(example: boolean) {
    const url = URL.createObjectURL(
      new Blob([salesTemplate(value, example)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = example ? "exemplo-vendas.csv" : "modelo-vendas.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="business-profile">
      <fieldset className="knowledge-choice">
        <legend>{translate("Como você se sente ao trabalhar com dados?")}</legend>
        <p>{translate("Sua escolha adapta a ajuda. Você pode mudar de nível a qualquer momento nesta etapa.")}</p>
        <div className="knowledge-options">
          {KNOWLEDGE_LEVELS.map((level) => (
            <button type="button" key={level.value} aria-pressed={value.knowledge === level.value}
              onClick={() => onChange({ ...value, knowledge: level.value })}>
              <strong>{translate(level.label)}</strong><span>{translate(level.detail)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <h3>{translate("Qual atividade melhor descreve sua empresa?")}</h3>
      <p>
        {translate(
          "Escolha seu contexto e objetivo. As sugestões usam somente os campos disponíveis na sua fonte.",
        )}
      </p>
      <div className="business-segments">
        {SEGMENTS.map((s) => (
          <button
            type="button"
            key={s.value}
            aria-pressed={value.segment === s.value}
            onClick={() => onChange({ ...value, segment: s.value, objective: s.value === "other" ? "explore" : value.objective })}
          >
            <strong>{translate(s.label)}</strong>
            <span>{translate(s.detail)}</span>
          </button>
        ))}
      </div>
      <div className="business-fields">
        <label className="model-field">
          <span>{translate("Como você opera? (opcional)")}</span>
          <input
            value={value.operation}
            maxLength={120}
            placeholder={translate("Ex.: loja física e e-commerce")}
            onChange={(e) => onChange({ ...value, operation: e.target.value })}
          />
        </label>
        <Field
          label="O que você quer entender primeiro?"
          value={value.objective}
          onChange={(objective) => onChange({ ...value, objective })}
          options={[...OBJECTIVES]}
        />
      </div>
      {templates && value.segment && value.segment !== "other" && (
        <div className="business-templates">
          <p>
            {translate(
              "Uma linha por item vendido. Valor e custo são os totais da linha; não repita o total do pedido em cada item. O exemplo tem dois itens no mesmo pedido.",
            )}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => download(false)}
          >
            {translate("Baixar modelo vazio")}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => download(true)}
          >
            {translate("Baixar exemplo preenchido")}
          </button>
          <small>
            {translate(
              "O exemplo contém dados fictícios. Use o modelo vazio para trazer seus dados reais.",
            )}
          </small>
        </div>
      )}
    </section>
  );
}

export function BusinessReview({
  source,
  profile,
  onProfile,
  previous,
  onReady,
}: {
  source: Source;
  profile: BusinessProfile;
  onProfile: (p: BusinessProfile) => void;
  previous?: BusinessContext;
  onReady: (c: Config | null) => void;
}) {
  const [mapping, setMapping] = useState(() =>
    suggestMapping(source, previous),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [step, setStep] = useState<"fields" | "charts">("fields");
  const beginner = !profile.knowledge || profile.knowledge === "beginner";
  const language = getLanguage();
  const check = useMemo(
    () => inspectBusinessSource(source, mapping),
    [source, mapping],
  );
  const proposed = useMemo(() => {
    try {
      const base = buildBusinessDashboard(source, profile, mapping, true);
      return {
        ...translateBusinessVisuals(base),
        title:
          `${translate(SEGMENTS.find((s) => s.value === profile.segment)!.label)} · ${source.name}`.slice(
            0,
            300,
          ),
      };
    } catch {
      return null;
    }
  }, [source, profile, mapping, language]);
  const selected = useMemo(() => proposed ? { ...proposed, visuals: proposed.visuals?.filter((v) => !excluded.includes(v.id)) } : null, [proposed, excluded]);
  useEffect(() => {
    onReady(confirmed && profile.knowledge && selected?.visuals?.length ? selected : null);
  }, [confirmed, selected, profile.knowledge, onReady]);
  const change = (role: Role, field: string) => {
    setConfirmed(false);
    setExcluded([]);
    setMapping({ ...mapping, [role]: field });
  };
  return (
    <section className="business-review">
      <div hidden={beginner && step === "charts"}>
      <BusinessProfileFields
        value={profile}
        onChange={(p) => {
          setConfirmed(false);
          setExcluded([]);
          setStep("fields");
          onProfile(p);
        }}
      />
      </div>
      {beginner && (
        <div className="onboarding-guide" role="status">
          <strong>{translate(step === "fields" ? "1. Vamos entender seus dados" : "2. Escolha seu primeiro painel")}</strong>
          <p>{translate("O sistema usa os nomes e o conteúdo das colunas para propor análises. Confira as sugestões: ele não conhece sozinho as regras do seu negócio.")}</p>
          <p>{translate("Fonte: {v0} · {v1} registros · {v2} colunas", { v0: source.name, v1: source.rows.length, v2: source.columns.length })}</p>
        </div>
      )}
      {(!beginner || step === "fields") && <>
      <h3>{translate("Confira o significado das suas colunas")}</h3>
      <p>
        {translate(
          "As correspondências são sugestões. Confira os exemplos e ajuste antes de publicar. Campos sem associação não geram indicadores.",
        )}
      </p>
      <div className="business-mapping">
        {ROLES.map((r) => (
          <div key={r.value}>
            <Field
              label={r.label}
              value={mapping[r.value] || ""}
              onChange={(v) => change(r.value, v)}
              options={[
                { value: "", label: "Não tenho este campo" },
                ...source.columns.map((c) => ({
                  value: c,
                  label: c,
                  raw: true,
                })),
              ]}
            />
            <small>
              {mapping[r.value]
                ? source.rows
                    .slice(0, 3)
                    .map((row) => row[mapping[r.value]!] || "—")
                    .join(" · ")
                : "—"}
            </small>
          </div>
        ))}
      </div>
      <div className="business-checks" aria-live="polite">
        <div>
          <strong>{check.lines.toLocaleString(locale())}</strong>
          <span>{translate("Linhas recebidas")}</span>
        </div>
        <div>
          <strong>
            {check.total === null
              ? "—"
              : new Intl.NumberFormat(locale(), {
                  ...(profile.objective === "explore" ? { maximumFractionDigits: 2 } : { style: "currency", currency: "BRL" }),
                }).format(check.total)}
          </strong>
          <span>{translate("Total da coluna de valor")}</span>
        </div>
        <div>
          <strong>{check.orders ?? "—"}</strong>
          <span>{translate("Pedidos distintos identificados")}</span>
        </div>
        <div>
          <strong>{check.from ? `${check.from} → ${check.to}` : "—"}</strong>
          <span>{translate("Cobertura dos dados")}</span>
        </div>
      </div>
      {check.errors.map((e) => (
        <p className="model-error" role="alert" key={e}>
          {translate(e)}
        </p>
      ))}
      <ul className="business-notes">
        {!mapping.value && (
          <li>
            {translate(
              "Sem valor associado: o painel mostrará contagens, não faturamento.",
            )}
          </li>
        )}
        {!mapping.date && (
          <li>
            {translate(
              "Sem data associada: a evolução por período fica indisponível.",
            )}
          </li>
        )}
        {!mapping.order && (
          <li>
            {translate(
              "Sem identificador de pedido: linhas não serão apresentadas como pedidos nem como ticket médio.",
            )}
          </li>
        )}
        {check.missingOrders > 0 && (
          <li>
            {translate(
              "{v0} linhas sem identificador de pedido ficam fora da contagem de pedidos.",
              { v0: check.missingOrders },
            )}
          </li>
        )}
        {check.negative > 0 && (
          <li>
            {translate(
              "{v0} valores negativos serão mantidos. Confira se representam devoluções ou ajustes.",
              { v0: check.negative },
            )}
          </li>
        )}
        <li>
          {translate(
            "Os totais usam a coluna escolhida, sem deduções automáticas. Não representam lucro, margem ou ticket médio.",
          )}
        </li>
      </ul>
      {beginner && <button type="button" className="primary-button" disabled={!proposed || !profile.knowledge} onClick={() => setStep("charts")}>
        {translate("Ver os gráficos sugeridos")}
      </button>}
      </>}
      {(!beginner || step === "charts") && <>
      {beginner && <button type="button" className="secondary-button" onClick={() => { setStep("fields"); setConfirmed(false); }}>{translate("Voltar e revisar os campos")}</button>}
      {proposed && (
        <>
          <h3>{translate("Seu painel já tem um ponto de partida")}</h3>
          <p>
            {translate(
              "Prévia com os dados desta fonte. Você poderá filtrar, explorar e personalizar depois.",
            )}
          </p>
          <div className="business-preview">
            {proposed.visuals?.map((v) => (
              <article key={v.id} className={excluded.includes(v.id) ? "suggestion-excluded" : ""}>
                <label className="suggestion-toggle"><input type="checkbox" checked={!excluded.includes(v.id)} onChange={(e) => {
                  setConfirmed(false);
                  setExcluded(e.target.checked ? excluded.filter((id) => id !== v.id) : [...excluded, v.id]);
                }} /><strong>{v.title}</strong></label>
                {beginner && <p className="suggestion-reason">{translate(v.type === "line" ? "Veja como os resultados mudam ao longo das datas disponíveis." : v.type === "horizontal" ? "Compare as categorias e encontre as maiores participações. Mostra até 10 categorias." : v.type === "table" ? "Confira os dados que sustentam sua análise." : v.measures?.[0]?.aggregation === "distinct" ? "Conta cada identificador preenchido uma única vez, mesmo que apareça em várias linhas." : v.measures?.[0]?.aggregation === "count" ? "Mostra quantas linhas chegaram nesta fonte; uma linha não significa necessariamente uma venda." : "Soma os valores da coluna confirmada. Não calcula lucro nem desconta custos automaticamente.")}</p>}
                <div style={{ height: v.type === "kpi" ? 100 : 220 }}>
                  <VisualChart
                    source={source}
                    rows={source.rows}
                    visual={v}
                    color="#0b9b72"
                    dark={false}
                  />
                </div>
              </article>
            ))}
          </div>
          <p>
            {translate(
              "{v0} visuais serão criados com as colunas confirmadas.",
              { v0: selected?.visuals?.length || 0 },
            )}
          </p>
        </>
      )}
      <label className="business-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!selected?.visuals?.length || !profile.knowledge}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          {translate(
            "Conferi as correspondências. Se associei um valor, ele representa o total de cada linha, não um preço unitário nem o total do pedido repetido nos itens.",
          )}
        </span>
      </label>
      </>}
    </section>
  );
}

export function GuidedDashboard({
  source,
  previous,
  onClose,
  onCreate,
}: {
  source: Source;
  previous?: BusinessContext;
  onClose: () => void;
  onCreate: (c: Config) => Promise<boolean>;
}) {
  const [profile, setProfile] = useState(previous?.profile || EMPTY_PROFILE),
    [config, setConfig] = useState<Config | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="model-dialog business-dialog">
        <DialogHeader className="model-header">
          <DialogTitle>{translate("Vamos preparar seu painel")}</DialogTitle>
          <DialogDescription>
            {source.name} ·{" "}
            {translate(
              "Escolha o objetivo, confira os dados e abra o painel pronto.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="business-dialog-body">
          <BusinessReview
            source={source}
            profile={profile}
            onProfile={setProfile}
            previous={previous}
            onReady={setConfig}
          />
        </div>
        {error && (
          <p role="alert" className="model-error">
            {error}
          </p>
        )}
        <footer className="model-footer">
          <button
            className="secondary-button"
            disabled={saving}
            onClick={onClose}
          >
            {translate("Cancelar")}
          </button>
          <button
            className="primary-button"
            disabled={!config || saving}
            onClick={async () => {
              if (!config) return;
              setSaving(true);
              try {
                if (await onCreate(config)) onClose();
                else
                  setError(
                    translate(
                      "Não foi possível salvar. Sua conferência continua disponível.",
                    ),
                  );
              } catch {
                setError(
                  translate(
                    "Não foi possível salvar. Sua conferência continua disponível.",
                  ),
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {translate(saving ? "Salvando…" : "Salvar e abrir meu painel")}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

export function BusinessSummary({
  source,
  context,
}: {
  source: Source;
  context: BusinessContext;
}) {
  const check = useMemo(
    () => inspectBusinessSource(source, context.mapping),
    [source, context],
  );
  return (
    <aside className="business-summary">
      <strong>
        {translate(
          OBJECTIVES.find((o) => o.value === context.profile.objective)
            ?.label || "Seu painel de vendas",
        )}
      </strong>
      <p>
        {source.name} · {translate("Cobertura dos dados")}:{" "}
        {check.from
          ? `${check.from} → ${check.to}`
          : translate("Data não associada")}{" "}
        · {translate("Última carga")}:{" "}
        {new Date(
          source.lastLoad?.at ||
            source.remoteInfo?.fetchedAt ||
            source.createdAt,
        ).toLocaleString(locale())}
      </p>
      {source.remoteInfo?.provider === "omie" && (
        <p>
          {translate(
            "Omie: uma linha por pedido faturado. Cancelados, denegados e pedidos com devolução total ou parcial são excluídos. O valor não representa recebimentos nem lucro.",
          )}
        </p>
      )}
      <details>
        <summary>{translate("Como este painel foi montado")}</summary>
        <p>
          {translate(
            "As correspondências abaixo foram confirmadas na criação do painel. Se você personalizar os visuais, confira também suas medidas e filtros.",
          )}
        </p>
        <dl>
          {ROLES.filter((r) => context.mapping[r.value]).map((r) => (
            <div key={r.value}>
              <dt>{translate(r.label)}</dt>
              <dd>{context.mapping[r.value]}</dd>
            </div>
          ))}
        </dl>
        <p>
          {translate(
            "Vendas informadas é a soma da coluna escolhida, sem deduções automáticas. Este painel não calcula lucro, margem ou ticket médio.",
          )}
        </p>
        <p>
          {source.remoteInfo
            ? translate(
                "Esta fonte é atualizada pela conexão Omie. Confira o horário, a seleção e o histórico em Conexões.",
              )
            : translate(
                "Para atualizar, envie novos dados para a mesma base. Os painéis mantêm o vínculo com ela.",
              )}
        </p>
      </details>
      {check.errors.length > 0 && (
        <ul role="alert">
          {check.errors.map((e) => (
            <li key={e}>{translate(e)}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
