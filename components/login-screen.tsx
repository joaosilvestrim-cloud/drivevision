"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
  Loader2,
  ShieldCheck,
  ChevronRight,
  ChartNoAxesCombined,
  Layers3,
  Fingerprint,
} from "lucide-react";
import { apiJson, type Account } from "@/lib/cloud-workspace";

export function LoginScreen({
  onLogin,
  onLocal,
  configured,
  activationToken,
  onClearActivation,
  hasSession = false,
  initialRegister = false,
}: {
  onLogin: (user: Account) => void;
  onLocal: () => void;
  configured: boolean;
  activationToken: string | null;
  onClearActivation: () => void;
  hasSession?: boolean;
  initialRegister?: boolean;
}) {
  const [register, setRegister] = useState(initialRegister),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [name, setName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const activate = !!activationToken,
    creating = register || activate;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (creating && password !== confirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiJson<{ user: Account }>(
        activate ? "activate" : register ? "register" : "login",
        activate
          ? { token: activationToken, password }
          : { email, password, ...(register ? { name, acceptedTerms } : {}) },
      );
      setPassword("");
      setConfirmation("");
      onLogin(result.user);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-world">
      <div className="login-noise" aria-hidden="true" />
      <header className="login-header">
        <a className="drive-brand" href="/" aria-label="DriveData DriveVision">
          <img src="/drivedata-logo.png" alt="" width={40} height={40} />
          <span>
            drive<span>data</span>
            <small>DRIVEVISION</small>
          </span>
        </a>
        <div className="login-edition">
          <span /> WORKSPACE DE ANÁLISES
        </div>
      </header>
      <div className="login-body">
        <section className="login-story" aria-label="DriveVision">
          <div className="login-kicker">
            <span /> INTELIGÊNCIA PARA SUAS DECISÕES
          </div>
          <h1>
            Enxergue além.
            <br />
            <em>Decida melhor.</em>
          </h1>
          <p>
            Seus dados têm uma história.
            <br />
            Seu próximo grande insight começa aqui.
          </p>
          <div className="login-orbit" aria-hidden="true">
            <div className="orbit-floor" />
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core">
              <div className="orbit-glow" />
              <img src="/drivedata-logo.png" alt="" width={180} height={180} />
            </div>
            <div className="orbit-signal signal-one">
              <ChartNoAxesCombined size={19} />
              <span>
                DADOS<strong>Novas perspectivas</strong>
              </span>
              <svg viewBox="0 0 80 35">
                <path
                  d="M2 30 L16 25 L28 29 L40 13 L52 20 L66 6 L78 2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <div className="orbit-signal signal-two">
              <Layers3 size={18} />
              <span>
                SEU WORKSPACE<strong>Ideias em movimento</strong>
              </span>
              <i />
              <i />
              <i />
            </div>
            <span className="orbit-dot dot-one" />
            <span className="orbit-dot dot-two" />
          </div>
          <div className="login-capabilities">
            <span>
              01 <b>Conecte seus dados</b>
            </span>
            <span>
              02 <b>Crie suas visões</b>
            </span>
            <span>
              03 <b>Encontre respostas</b>
            </span>
          </div>
        </section>
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel-top">
            <span className="login-access-icon">
              <Fingerprint size={27} />
            </span>
            <span>SEU ESPAÇO. SUAS POSSIBILIDADES.</span>
          </div>
          <h2 id="login-title">
            {activate
              ? "Sua conta está pronta."
              : register
                ? "Vamos começar."
                : "Bom ter você aqui."}
          </h2>
          <p className="login-subtitle">
            {activate
              ? "Defina sua senha para ativar seu workspace."
              : register
                ? "Comece com 7 dias grátis. Depois, R$ 59,90/mês."
                : "Entre para continuar de onde parou."}
          </p>
          {!activate && (
            <div
              className="login-tabs"
              role="group"
              aria-label="Acesso à conta"
            >
              <button
                type="button"
                aria-pressed={!register}
                disabled={busy}
                onClick={() => {
                  setRegister(false);
                  setError("");
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                aria-pressed={register}
                disabled={busy}
                onClick={() => {
                  setRegister(true);
                  setError("");
                }}
              >
                Criar conta
              </button>
            </div>
          )}
          <form className="login-form" onSubmit={submit}>
            {register && !activate && (
              <label>
                Seu nome
                <div className="login-input">
                  <UserRound size={18} />
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder="Como podemos chamar você?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={busy}
                  />
                </div>
              </label>
            )}
            {!activate && (
              <label>
                E-mail
                <div className="login-input">
                  <Mail size={18} />
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="voce@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </div>
              </label>
            )}
            <label>
              {creating ? "Crie sua senha" : "Senha"}
              <div className="login-input">
                <LockKeyhole size={18} />
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={creating ? "new-password" : "current-password"}
                  placeholder={
                    creating
                      ? "Pelo menos 12 caracteres"
                      : "Sua senha de acesso"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={128}
                  disabled={busy}
                  aria-describedby={creating ? "password-guidance" : undefined}
                />
                <button
                  type="button"
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {creating && (
              <>
                <p className="login-password-help" id="password-guidance">
                  Use 12 ou mais caracteres. Uma frase longa é mais fácil de
                  lembrar.
                </p>
                <label>
                  Confirme sua senha
                  <div className="login-input">
                    <ShieldCheck size={18} />
                    <input
                      name="confirmation"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Repita sua senha"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      required
                      minLength={12}
                      maxLength={128}
                      disabled={busy}
                    />
                  </div>
                </label>
              </>
            )}
            {register && !activate && (
              <>
                <p className="login-price-note">
                  <strong>7 dias grátis · depois R$ 59,90/mês</strong>Cadastre o
                  cartão na próxima etapa. Renovação automática após o teste.
                  Cancele antes da primeira cobrança para não cobrar.
                </p>
                <label className="login-terms">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    required
                    disabled={busy}
                  />
                  <span>
                    Li e aceito os{" "}
                    <a href="/?view=terms" target="_blank" rel="noreferrer">
                      termos de uso
                    </a>{" "}
                    e a{" "}
                    <a href="/?view=privacy" target="_blank" rel="noreferrer">
                      política de privacidade
                    </a>
                    .
                  </span>
                </label>
              </>
            )}
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            {!configured && (
              <p className="login-error" role="status">
                A conexão com o servidor de contas está indisponível. Você ainda
                pode explorar o modo local.
              </p>
            )}
            <button
              className="login-submit"
              type="submit"
              disabled={busy || !configured}
            >
              {busy ? (
                <>
                  <Loader2 className="spin" size={18} />{" "}
                  {activate
                    ? "Ativando sua conta…"
                    : "Conectando ao seu workspace…"}
                </>
              ) : (
                <>
                  {activate
                    ? "Ativar e entrar"
                    : register
                      ? "Criar conta e continuar"
                      : "Acessar meu workspace"}
                  <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>
          <div className="login-trust">
            <ShieldCheck size={14} />
            <span>Sessão protegida · workspace privado</span>
          </div>
          {!creating && (
            <a className="login-recovery" href="/?view=recover">
              Esqueci minha senha
            </a>
          )}
          {activate && !hasSession && (
            <button
              className="login-back"
              type="button"
              disabled={busy}
              onClick={onClearActivation}
            >
              Já ativei minha conta · voltar para o login
            </button>
          )}
          <div className="login-local">
            <span>
              {hasSession
                ? "Sua conta já está conectada."
                : "Quer conhecer primeiro?"}
            </span>
            <button type="button" disabled={busy} onClick={onLocal}>
              {hasSession
                ? "Voltar ao meu workspace"
                : "Explorar no modo local"}{" "}
              <ChevronRight size={15} />
            </button>
            <small>
              {hasSession
                ? "Seu acesso atual continua ativo."
                : "As análises ficam apenas neste navegador."}
            </small>
          </div>
        </section>
      </div>
      <footer className="login-footer">
        <span>DriveData © {new Date().getFullYear()}</span>
        <span>Transforme dados em próximos passos.</span>
        <span>
          <a href="/?view=terms">Termos</a> <i>·</i>{" "}
          <a href="/?view=privacy">Privacidade</a>
        </span>
      </footer>
    </main>
  );
}

export function WorkspaceEntrance({
  name,
  onDone,
}: {
  name: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(onDone, reduced ? 0 : 1400);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="workspace-entrance" role="status">
      <div className="entrance-halo" />
      <img src="/drivedata-logo.png" width={100} height={100} alt="DriveData" />
      <span>CONEXÃO ESTABELECIDA</span>
      <h1>Bem-vindo, {name.split(" ")[0]}.</h1>
      <p>Vamos transformar dados em possibilidades.</p>
      <button onClick={onDone}>
        Continuar <ArrowRight size={15} />
      </button>
    </div>
  );
}
