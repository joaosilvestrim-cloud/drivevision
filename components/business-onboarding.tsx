"use client";
import { useEffect, useMemo, useState } from "react";
import { t as translate, locale, getLanguage } from "@/lib/i18n";
import {
  SEGMENTS,
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
      <h3>{translate("Qual atividade melhor descreve sua empresa?")}</h3>
      <p>
        {translate(
          "Vamos sugerir um painel de vendas e clientes. Estoque, caixa, produção e lucro completo ainda não fazem parte destes modelos.",
        )}
      </p>
      <div className="business-segments">
        {SEGMENTS.map((s) => (
          <button
            type="button"
            key={s.value}
            aria-pressed={value.segment === s.value}
            onClick={() => onChange({ ...value, segment: s.value })}
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
      {templates && value.segment && (
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
  const language = getLanguage();
  const check = useMemo(
    () => inspectBusinessSource(source, mapping),
    [source, mapping],
  );
  const proposed = useMemo(() => {
    try {
      const base = buildBusinessDashboard(source, profile, mapping, true);
      return {
        ...base,
        title:
          `${translate(SEGMENTS.find((s) => s.value === profile.segment)!.label)} · ${source.name}`.slice(
            0,
            300,
          ),
        visuals: base.visuals?.map((v) => {
          const ranking = v.title.match(/^(Vendas|Registros) por (.+)$/);
          const title = ranking
            ? translate(
                ranking[1] === "Vendas"
                  ? "Vendas por {v0}"
                  : "Registros por {v0}",
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
    } catch {
      return null;
    }
  }, [source, profile, mapping, language]);
  useEffect(() => {
    onReady(confirmed ? proposed : null);
  }, [confirmed, proposed, onReady]);
  const change = (role: Role, field: string) => {
    setConfirmed(false);
    setMapping({ ...mapping, [role]: field });
  };
  return (
    <section className="business-review">
      <BusinessProfileFields
        value={profile}
        onChange={(p) => {
          setConfirmed(false);
          onProfile(p);
        }}
      />
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
                  style: "currency",
                  currency: "BRL",
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
            "Vendas informadas é a soma da coluna escolhida, sem deduções automáticas. Este painel não calcula lucro, margem ou ticket médio.",
          )}
        </li>
      </ul>
      {proposed && (
        <>
          <h3>{translate("Seu painel já tem um ponto de partida")}</h3>
          <p>
            {translate(
              "Prévia com os dados desta fonte. Você poderá filtrar, explorar e personalizar depois.",
            )}
          </p>
          <div className="business-preview">
            {proposed.visuals?.slice(0, 4).map((v) => (
              <article key={v.id}>
                <h4>{translate(v.title)}</h4>
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
              { v0: proposed.visuals?.length || 0 },
            )}
          </p>
        </>
      )}
      <label className="business-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!proposed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          {translate(
            "Conferi as correspondências. Se associei um valor, ele representa o total de cada linha, não um preço unitário nem o total do pedido repetido nos itens.",
          )}
        </span>
      </label>
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
        {new Date(source.lastLoad?.at || source.createdAt).toLocaleString(
          locale(),
        )}
      </p>
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
          {translate(
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
