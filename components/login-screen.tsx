"use client";
import { t as translate, locale } from "@/lib/i18n";
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
  verifiedEmail = false,
}: {
  onLogin: (user: Account) => void;
  onLocal: () => void;
  configured: boolean;
  activationToken: string | null;
  onClearActivation: () => void;
  hasSession?: boolean;
  initialRegister?: boolean;
  verifiedEmail?: boolean;
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
      setError(translate("As senhas precisam ser iguais."));
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
      {verifiedEmail && (
        <p className="email-notice" role="status">
          {translate(
            "E-mail confirmado. Entre com a conta que você acabou de confirmar para continuar a ativação.",
          )}
        </p>
      )}
      <div className="login-noise" aria-hidden="true" />
      <header className="login-header">
        <a
          className="drive-brand"
          href="/"
          aria-label={translate("DriveData DriveVision")}
        >
          <img src="/drivedata-logo.png" alt="" width={40} height={40} />
          <span>
            {translate(" drive")}
            <span>{translate("data")}</span>
            <small>{translate("DRIVEVISION")}</small>
          </span>
        </a>
      </header>
      <div className="login-body">
        <section className="login-story" aria-label={translate("DriveVision")}>
          <h1>
            {translate(" Enxergue além. ")}
            <br />
            <em>{translate("Decida melhor.")}</em>
          </h1>
          <p>
            {translate(" Seus dados têm uma história. ")}
            <br />
            {translate(" Seu próximo grande insight começa aqui. ")}
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
                {translate(" DADOS")}
                <strong>{translate("Novas perspectivas")}</strong>
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
                {translate(" SEU WORKSPACE")}
                <strong>{translate("Ideias em movimento")}</strong>
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
              01 <b>{translate("Conecte seus dados")}</b>
            </span>
            <span>
              02 <b>{translate("Crie suas visões")}</b>
            </span>
            <span>
              03 <b>{translate("Encontre respostas")}</b>
            </span>
          </div>
        </section>
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel-top">
            <span className="login-access-icon">
              <Fingerprint size={27} />
            </span>
            <span>{translate("SEU ESPAÇO. SUAS POSSIBILIDADES.")}</span>
          </div>
          <h2 id="login-title">
            {activate
              ? translate("Sua conta está pronta.")
              : register
                ? translate("Vamos começar.")
                : translate("Bom ter você aqui.")}
          </h2>
          <p className="login-subtitle">
            {activate
              ? translate("Defina sua senha para ativar seu workspace.")
              : register
                ? translate("Comece com 7 dias grátis. Depois, R$ 59,90/mês.")
                : translate("Entre para continuar de onde parou.")}
          </p>
          {!activate && (
            <div
              className="login-tabs"
              role="group"
              aria-label={translate("Acesso à conta")}
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
                {translate(" Entrar ")}
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
                {translate(" Criar conta ")}
              </button>
            </div>
          )}
          <form className="login-form" onSubmit={submit}>
            {register && !activate && (
              <label>
                {translate(" Seu nome ")}
                <div className="login-input">
                  <UserRound size={18} />
                  <input
                    name="name"
                    autoComplete="name"
                    placeholder={translate("Como podemos chamar você?")}
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
                {translate(" E-mail ")}
                <div className="login-input">
                  <Mail size={18} />
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder={translate("voce@empresa.com.br")}
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
              {creating ? translate("Crie sua senha") : translate("Senha")}
              <div className="login-input">
                <LockKeyhole size={18} />
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={creating ? "new-password" : "current-password"}
                  placeholder={
                    creating
                      ? translate("Pelo menos 12 caracteres")
                      : translate("Sua senha de acesso")
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
                  aria-label={
                    visible
                      ? translate("Ocultar senha")
                      : translate("Mostrar senha")
                  }
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
                  {translate(
                    " Use 12 ou mais caracteres. Uma frase longa é mais fácil de lembrar. ",
                  )}
                </p>
                <label>
                  {translate(" Confirme sua senha ")}
                  <div className="login-input">
                    <ShieldCheck size={18} />
                    <input
                      name="confirmation"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={translate("Repita sua senha")}
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
                  <strong>
                    {translate("7 dias grátis · depois R$ 59,90/mês")}
                  </strong>
                  {translate(
                    "Cadastre o cartão na próxima etapa. Renovação automática após o teste. Cancele antes da primeira cobrança para não cobrar. ",
                  )}
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
                    {translate(" Li e aceito os")}{" "}
                    <a href="/?view=terms" target="_blank" rel="noreferrer">
                      {translate(" termos de uso ")}
                    </a>{" "}
                    {translate(" e a")}{" "}
                    <a href="/?view=privacy" target="_blank" rel="noreferrer">
                      {translate(" política de privacidade ")}
                    </a>
                    .
                  </span>
                </label>
              </>
            )}
            {error && (
              <p className="login-error" role="alert">
                {translate(error)}
              </p>
            )}
            {!configured && (
              <p className="login-error" role="status">
                {translate(
                  " A conexão com o servidor de contas está indisponível. Você ainda pode explorar o modo local. ",
                )}
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
                    ? translate("Ativando sua conta…")
                    : translate("Conectando ao seu workspace…")}
                </>
              ) : (
                <>
                  {activate
                    ? translate("Ativar e entrar")
                    : register
                      ? translate("Criar conta e continuar")
                      : translate("Acessar meu workspace")}
                  <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>
          <div className="login-trust">
            <ShieldCheck size={14} />
            <span>{translate("Sessão protegida · workspace privado")}</span>
          </div>
          {!creating && (
            <a className="login-recovery" href="/?view=recover">
              {translate(" Esqueci minha senha ")}
            </a>
          )}
          {activate && !hasSession && (
            <button
              className="login-back"
              type="button"
              disabled={busy}
              onClick={onClearActivation}
            >
              {translate(" Já ativei minha conta · voltar para o login ")}
            </button>
          )}
          <div className="login-local">
            <span>
              {hasSession
                ? translate("Sua conta já está conectada.")
                : translate("Quer conhecer primeiro?")}
            </span>
            <button type="button" disabled={busy} onClick={onLocal}>
              {hasSession
                ? translate("Voltar ao meu workspace")
                : translate("Explorar no modo local")}{" "}
              <ChevronRight size={15} />
            </button>
            <small>
              {hasSession
                ? translate("Seu acesso atual continua ativo.")
                : translate("As análises ficam apenas neste navegador.")}
            </small>
          </div>
        </section>
      </div>
      <footer className="login-footer">
        <span>
          {translate("DriveData © ")}
          {new Date().getFullYear()}
        </span>
        <span>{translate("Transforme dados em próximos passos.")}</span>
        <span>
          <a href="/?view=terms">{translate("Termos")}</a> <i>·</i>{" "}
          <a href="/?view=privacy">{translate("Privacidade")}</a>
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
      <img
        src="/drivedata-logo.png"
        width={100}
        height={100}
        alt={translate("DriveData")}
      />
      <span>{translate("CONEXÃO ESTABELECIDA")}</span>
      <h1>
        {translate("Bem-vindo, ")}
        {name.split(" ")[0]}.
      </h1>
      <p>{translate("Vamos transformar dados em possibilidades.")}</p>
      <button onClick={onDone}>
        {translate(" Continuar ")}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
