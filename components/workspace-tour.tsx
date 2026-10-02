"use client";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ArrowLeft, ArrowRight, Compass, X } from "lucide-react";
import { t as translate } from "@/lib/i18n";

type TourView = "library" | "sources" | "studio" | "connections";
const steps: {
  title: string;
  body: string;
  view?: TourView;
  target?: string;
}[] = [
  {
    title: "Vamos conhecer seu DriveVision?",
    body: "Em poucos passos, descubra onde importar dados, montar gráficos e guardar suas análises. Este passeio não altera nem salva seus dados.",
  },
  {
    title: "Um lugar para todos os seus dashboards",
    body: "Em Novo dashboard, envie uma planilha, use uma fonte existente ou experimente um painel pronto. Seus painéis salvos ficam aqui, organizados em pastas e favoritos.",
    view: "library",
    target: "[data-tour='new-dashboard']",
  },
  {
    title: "Traga sua primeira planilha",
    body: "Em Dados, clique em Importar planilha. Escolha seu segmento e objetivo, confira a tabela e confirme as colunas. Você verá uma prévia antes de salvar seu painel pronto.",
    view: "sources",
    target: "[data-tour='import']",
  },
  {
    title: "Prepare os dados antes de analisar",
    body: "No Estúdio, Preparar dados permite corrigir tipos, tratar valores, remover duplicados e criar colunas calculadas. Se estiver no modo de visualização, clique em Editar painel primeiro.",
    view: "studio",
    target: "[data-tour='editor-tools']",
  },
  {
    title: "Crie gráficos com a sua cara",
    body: "Use Adicionar visual para escolher indicadores, gráficos ou tabelas. Selecione um bloco para definir medidas, categorias, filtros e cores. Arraste e redimensione os blocos para organizar o painel.",
    view: "studio",
    target: "[data-tour='chart-tools']",
  },
  {
    title: "Salve para continuar depois",
    body: "Clique em Salvar, escolha um nome e uma pasta. O painel ficará na Área de trabalho. Confira o aviso de rascunho: alterações ainda não salvas precisam ser guardadas.",
    view: "studio",
    target: "[data-tour='save']",
  },
  {
    title: "Mantenha suas fontes atualizadas",
    body: "Em Conexões, escolha arquivos do OneDrive ou SharePoint, ou conecte o Omie com as chaves da sua empresa para analisar pedidos faturados. Confira a prévia e defina a atualização. Google Drive e outros sistemas estão em breve.",
    view: "connections",
    target: "[data-tour='nav-connections']",
  },
  {
    title: "Você tem ajuda sempre por perto",
    body: "Abra Ajuda e contato para consultar guias e falar com a DriveData. Para repetir este passeio, use Tour guiado no topo da sua área de trabalho. Agora é sua vez!",
    target: ".help-launcher",
  },
];

export function WorkspaceTour({
  onNavigate,
  onFinish,
}: {
  onNavigate: (view: TourView) => void;
  onFinish: (completed: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const card = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const step = steps[index],
    last = index === steps.length - 1;

  useEffect(() => {
    if (step.view) onNavigate(step.view);
    setRect(null);
    setPosition(null);
    let frame = 0;
    const measure = () => {
      const target = step.target ? document.querySelector(step.target) : null;
      const box = target?.getBoundingClientRect();
      const next =
        box && box.width && box.height
          ? {
              left: Math.max(6, box.left - 6),
              top: Math.max(6, box.top - 6),
              width: Math.min(
                box.width + 12,
                window.innerWidth - Math.max(6, box.left - 6) - 6,
              ),
              height: Math.min(
                box.height + 12,
                window.innerHeight - Math.max(6, box.top - 6) - 6,
              ),
            }
          : null;
      setRect(next && next.width > 0 && next.height > 0 ? next : null);
      const w =
        card.current?.offsetWidth || Math.min(420, window.innerWidth - 24);
      const h = card.current?.offsetHeight || 320;
      let left = next
        ? Math.min(Math.max(12, next.left), window.innerWidth - w - 12)
        : (window.innerWidth - w) / 2;
      let top = next
        ? next.top + next.height + 16
        : (window.innerHeight - h) / 2;
      if (top + h > window.innerHeight - 12 && next) top = next.top - h - 16;
      if (next && top < 12) {
        if (next.left >= w + 28) left = next.left - w - 16;
        else if (next.left + next.width + w + 28 <= window.innerWidth)
          left = next.left + next.width + 16;
        top = Math.max(12, (window.innerHeight - h) / 2);
      }
      setPosition({
        left: Math.max(12, left),
        top: Math.max(12, Math.min(top, window.innerHeight - h - 12)),
      });
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const timer = window.setTimeout(() => {
      if (step.target) {
        const target = document.querySelector(step.target);
        if (target && getComputedStyle(target).position !== "fixed") {
          target.scrollIntoView({
            block: "start",
            inline: "nearest",
            behavior: "instant",
          });
          window.scrollBy(0, -48);
        }
      }
      heading.current?.focus({ preventScroll: true });
      update();
    }, 80);
    const resize = new ResizeObserver(update);
    if (card.current) resize.observe(card.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, onNavigate]);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onFinish(false);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={`tour-blocker ${rect ? "has-target" : ""}`}
        />
        {rect && (
          <div aria-hidden="true" className="tour-spotlight" style={rect} />
        )}
        <Dialog.Content
          ref={card}
          className="tour-card"
          style={
            position || {
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
            }
          }
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="tour-top">
            <Compass size={22} />
            <span>{translate("Tour guiado")}</span>
            <button
              aria-label={translate("Fechar tour")}
              onClick={() => onFinish(false)}
            >
              <X size={19} />
            </button>
          </div>
          <div className="tour-progress" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={i <= index ? "visited" : ""} />
            ))}
          </div>
          <p className="tour-count" aria-live="polite">
            {translate("Passo {v0} de {v1}", {
              v0: index + 1,
              v1: steps.length,
            })}
          </p>
          <Dialog.Title ref={heading} tabIndex={-1}>
            {translate(step.title)}
          </Dialog.Title>
          <Dialog.Description>{translate(step.body)}</Dialog.Description>
          <div className="tour-actions">
            {index > 0 ? (
              <button
                className="tour-back"
                onClick={() => setIndex((i) => i - 1)}
              >
                <ArrowLeft size={16} />
                {translate("Voltar")}
              </button>
            ) : (
              <button className="tour-back" onClick={() => onFinish(false)}>
                {translate("Agora não")}
              </button>
            )}
            <button
              className="tour-next"
              onClick={() => (last ? onFinish(true) : setIndex((i) => i + 1))}
            >
              {translate(
                last
                  ? "Começar a usar"
                  : index === 0
                    ? "Começar o tour"
                    : "Próximo",
              )}
              <ArrowRight size={16} />
            </button>
          </div>
          {!last && index > 0 && (
            <button className="tour-skip" onClick={() => onFinish(false)}>
              {translate("Pular tour")}
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
