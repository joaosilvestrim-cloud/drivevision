"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Mail, ShieldCheck, Loader2, RefreshCw } from "lucide-react";
import { apiJson, type Account } from "@/lib/cloud-workspace";

export function EmailAccess({
  mode,
  token,
  account,
}: {
  mode: "verify" | "reset" | "recover";
  token: string | null;
  account: Account | null;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (mode === "reset" && password !== confirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "recover") {
        await apiJson("email/recover", { email });
        setDone(true);
      } else if (token) {
        await apiJson(`email/${mode}`, {
          token,
          ...(mode === "reset" ? { password } : {}),
        });
        setPassword("");
        setConfirmation("");
        setDone(true);
      } else {
        await apiJson("email/resend", {});
        setNotice(
          "Novo link solicitado. Confira sua caixa de entrada e o spam. Aguarde um minuto antes de solicitar outro.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível continuar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title = done
    ? mode === "recover"
      ? "Confira seu e-mail"
      : mode === "reset"
        ? "Senha atualizada"
        : "E-mail confirmado"
    : mode === "recover"
      ? "Recupere seu acesso"
      : mode === "reset"
        ? "Crie sua nova senha"
        : "Confirme seu e-mail";
  return (
    <main className="email-world">
      <a className="drive-brand" href="/">
        <img src="/drivedata-logo.png" width={40} height={40} alt="" />
        <span>
          drive<span>data</span>
          <small>DRIVEVISION</small>
        </span>
      </a>
      <section className="email-card">
        <span className="email-icon">
          {done ? <ShieldCheck size={28} /> : <Mail size={28} />}
        </span>
        <p className="email-eyebrow">SEU ACESSO. SUA SEGURANÇA.</p>
        <h1>{title}</h1>
        {done ? (
          <>
            <p>
              {mode === "recover"
                ? "Se existe uma conta ativa com esse e-mail, você receberá um link para criar uma nova senha. Confira também o spam."
                : mode === "reset"
                  ? "Sua senha foi alterada e as sessões anteriores foram encerradas. Entre com a nova senha."
                  : "Tudo certo. Você já pode continuar com sua assinatura e abrir seu workspace."}
            </p>
            <a className="login-submit" href="/?view=login">
              {mode === "verify" ? "Continuar" : "Voltar para entrar"}
            </a>
          </>
        ) : (
          <form onSubmit={submit}>
            <p>
              {mode === "recover"
                ? "Informe o e-mail usado no cadastro. Enviaremos um link válido por 30 minutos."
                : mode === "reset"
                  ? "Use pelo menos 12 caracteres. Após a alteração, você entrará novamente nos seus dispositivos."
                  : token
                    ? "Clique abaixo para confirmar seu endereço e continuar."
                    : `Enviamos um link de confirmação para ${account?.email || "seu e-mail"}. Confirme o endereço para continuar com a assinatura.`}
            </p>
            {mode === "recover" && (
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  required
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            {mode === "reset" && token && (
              <>
                <label>
                  Nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  Confirme a nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </>
            )}
            {notice && (
              <p role="status" className="email-notice">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="login-error">
                {error}
              </p>
            )}
            {(mode === "recover" || token || account) && (
              <button className="login-submit" disabled={busy} type="submit">
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : mode === "recover" ? (
                  "Enviar link de recuperação"
                ) : mode === "reset" ? (
                  "Salvar nova senha"
                ) : token ? (
                  "Confirmar meu e-mail"
                ) : (
                  "Reenviar confirmação"
                )}
              </button>
            )}
            {mode === "reset" && !token && (
              <p>
                Abra o link recebido por e-mail ou{" "}
                <a href="/?view=recover">solicite um novo link</a>.
              </p>
            )}
            {mode === "verify" && !token && account && (
              <>
                <button
                  className="email-link"
                  type="button"
                  onClick={() => window.location.assign("/?view=billing")}
                >
                  Já confirmei · atualizar acesso
                </button>
                <button
                  className="email-link"
                  disabled={busy}
                  type="button"
                  onClick={async () => {
                    await apiJson("logout", {});
                    window.location.assign("/?view=login");
                  }}
                >
                  Sair e usar outra conta
                </button>
              </>
            )}
            {mode === "reset" && error && (
              <a href="/?view=recover">Solicitar outro link</a>
            )}
            {mode === "recover" && (
              <a className="email-link" href="/?view=login">
                Voltar para entrar
              </a>
            )}
          </form>
        )}
        <footer>
          Precisa de ajuda?{" "}
          <a href="mailto:suporte@drivedata.com.br">Fale com a DriveData</a>
        </footer>
      </section>
    </main>
  );
}
type EmailStatus = {
  configured: boolean;
  sender: string;
  counts: { state: string; count: number }[];
  recent: {
    id: string;
    kind: string;
    state: string;
    email: string;
    createdAt: string;
    error: string | null;
  }[];
};
const states: Record<string, string> = {
  pending: "Na fila",
  sending: "Enviando",
  sent: "Aceito pelo serviço de e-mail",
  failed: "Falhou",
};
export function EmailAdmin() {
  const [data, setData] = useState<EmailStatus | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setData(await apiJson<EmailStatus>("admin/email"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar envios.");
    }
  }
  useEffect(() => {
    let live = true;
    apiJson<EmailStatus>("admin/email")
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "Falha ao consultar envios.",
          );
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="email-admin">
      <header>
        <div>
          <h2>E-mails automáticos</h2>
          <p>Cadastro, recuperação de acesso e avisos da assinatura.</p>
        </div>
        <button onClick={load} aria-label="Atualizar e-mails">
          <RefreshCw size={18} />
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.configured
              ? "Envio configurado"
              : "Envio aguardando configuração"}{" "}
            ·{" "}
            {data.counts
              .map((c) => `${states[c.state]}: ${c.count}`)
              .join(" · ")}
          </p>
          <div className="email-table">
            <table>
              <thead>
                <tr>
                  <th>Destinatário</th>
                  <th>Mensagem</th>
                  <th>Situação</th>
                  <th>Solicitada em</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td>
                      {{
                        verify: "Confirmação",
                        reset: "Recuperação",
                        subscription: "Assinatura",
                        support: "Atendimento",
                      }[r.kind] || r.kind}
                    </td>
                    <td>
                      {states[r.state]}
                      {r.error && <small>{r.error}</small>}
                    </td>
                    <td>{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.recent.length && <p>Os próximos envios aparecerão aqui.</p>}
          </div>
          <small>
            “Aceito” confirma o envio ao serviço. A entrega na caixa de entrada
            também depende do provedor do destinatário.
          </small>
        </>
      )}
    </section>
  );
}
