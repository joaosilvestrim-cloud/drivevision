import { useState } from "react";
import { t, locale } from "@/lib/i18n";
import { ArrowRight, Check, FileSpreadsheet } from "lucide-react";

const questions = ["Como minhas vendas evoluíram?", "Quais produtos mais vendem?", "Onde estão minhas maiores despesas?"];
const examples = [
  { month: "Jul", product: "Produto A", revenue: 8000, expense: 2800 },
  { month: "Jul", product: "Produto B", revenue: 6000, expense: 2100 },
  { month: "Ago", product: "Produto A", revenue: 10000, expense: 3200 },
  { month: "Ago", product: "Produto B", revenue: 7000, expense: 2400 },
  { month: "Set", product: "Produto A", revenue: 12000, expense: 3900 },
  { month: "Set", product: "Produto B", revenue: 9500, expense: 2800 },
];
const explanations = [
  "Compare os meses para entender a evolução da receita.",
  "Identifique os produtos com maior receita para orientar suas prioridades.",
  "Compare as despesas por produto e investigue o que merece atenção.",
];
export function LandingDemo() {
  const [question, setQuestion] = useState(0);
  const [horizontal, setHorizontal] = useState(false);
  const [dark, setDark] = useState(false);
  const groups = new Map<string, number>();
  for (const row of examples) {
    const key = question === 0 ? row.month : row.product;
    groups.set(key, (groups.get(key) || 0) + (question === 2 ? row.expense : row.revenue));
  }
  const rows = [...groups];
  const max = Math.max(...groups.values());
  const money = (value: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
  return <section className="sales-discovery" id="demonstracao" aria-labelledby="demo-title">
    <div className="sales-section-heading">
      <h2 id="demo-title">{t("O QUE VOCÊ GOSTARIA DE DESCOBRIR?")}</h2>
      <p>{t("Escolha uma pergunta e veja os mesmos dados ganharem uma nova perspectiva.")}</p>
    </div>
    <div className="discovery-questions" role="group" aria-label={t("Perguntas da demonstração")}>
      {questions.map((text, i) => <button key={text} aria-pressed={question === i} onClick={() => setQuestion(i)}>{t(text)}<ArrowRight size={18} /></button>)}
    </div>
    <div className="discovery-board">
      <div className="discovery-source">
        <FileSpreadsheet size={28} aria-hidden="true" />
        <h3>{t("Uma base. Diferentes respostas.")}</h3>
        <p>{t("Aqui usamos seis registros de exemplo. Na sua conta, você traz os dados do seu negócio.")}</p>
        <details>
          <summary>{t("Ver dados de exemplo")}</summary>
          <div className="discovery-table" tabIndex={0} role="region" aria-label={t("Dados de exemplo")}><table>
            <caption>{t("Dados fictícios para demonstração")}</caption>
            <thead><tr>{["Mês", "Produto", "Receita", "Despesa"].map(s => <th key={s} scope="col">{t(s)}</th>)}</tr></thead>
            <tbody>{examples.map((r, i) => <tr key={i}><td>{t(r.month)}</td><td>{t(r.product)}</td><td>{money(r.revenue)}</td><td>{money(r.expense)}</td></tr>)}</tbody>
          </table></div>
        </details>
        <div className="discovery-controls">
          <label><input type="checkbox" checked={horizontal} onChange={e => setHorizontal(e.target.checked)} />{t("Barras horizontais")}</label>
          <label><input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} />{t("Destaque em preto")}</label>
        </div>
        <p className="discovery-hint"><Check size={17} />{t("Experimente mudar a pergunta, o formato e a cor.")}</p>
      </div>
      <div className="discovery-result" aria-live="polite" aria-atomic="true">
        <div className="discovery-result-heading"><h3>{t(questions[question])}</h3><small>{t("DADOS ILUSTRATIVOS")}</small></div>
        <div className={`discovery-chart${horizontal ? " is-horizontal" : ""}${dark ? " is-dark" : ""}`}>
          {rows.map(([name, value]) => <div className="discovery-column" key={name}>
            <span className="discovery-value">{money(value)}</span>
            <div className="discovery-track" aria-hidden="true"><div style={horizontal ? { width: `${value / max * 100}%` } : { height: `${value / max * 100}%` }} /></div>
            <span className="discovery-label">{t(name)}</span>
          </div>)}
        </div>
        <p>{t(explanations[question])}</p>
      </div>
    </div>
  </section>;
}
