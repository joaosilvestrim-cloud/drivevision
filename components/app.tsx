"use client";
import { t as translate, locale } from "@/lib/i18n";
import { HelpWidget } from "./help-center";
import { LanguageSelector, useLanguage } from "./language-selector";
import { EmailAccess } from "./email-access";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  lazy,
  Suspense,
} from "react";
import { Cloud, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { LoginScreen, WorkspaceEntrance } from "./login-screen";
import { LandingPage, LegalPage } from "./landing-page";
import { BillingPage } from "./billing-page";
const Workspace = lazy(() => import("./workspace"));
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  apiJson,
  setApiAccount,
  cloudPersistence,
  localPersistence,
  type Account,
} from "@/lib/cloud-workspace";
import { loadWorkspace } from "@/lib/local-workspace";

export default function App() {
  useLanguage();
  const [user, setUserState] = useState<Account | null>(null),
    [checking, setChecking] = useState(true),
    [accountOpen, setAccountOpen] = useState(false),
    [generation, setGeneration] = useState(0);
  const setUser = useCallback((next: Account | null) => {
    setApiAccount(next?.id || null);
    setUserState(next);
  }, []);
  const [localMode, setLocalMode] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [entrance, setEntrance] = useState<string | null>(null);
  const [activationToken, setActivationToken] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.hash.slice(1)).get("activate"),
  );
  const [emailToken] = useState(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("token"),
  );
  useEffect(() => {
    if (emailToken)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [emailToken]);
  const finishEntrance = useCallback(() => setEntrance(null), []);
  useEffect(() => {
    if (activationToken)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
  }, [activationToken]);
  const storage = useMemo(
    () => (user ? cloudPersistence(user.id) : localPersistence),
    [user, generation],
  );
  useEffect(() => {
    let live = true;
    apiJson<{ configured: boolean }>("status")
      .then(async (status) => {
        if (live) setConfigured(status.configured);
        if (status.configured) {
          const result = await apiJson<{ user: Account | null }>("session");
          if (live) setUser(result.user);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, []);
  if (checking)
    return (
      <div className="login-boot">
        <img
          src="/drivedata-logo.png"
          width={60}
          height={60}
          alt={translate("DriveData")}
        />
        <Loader2 className="spin" size={18} />
        {translate(" Abrindo seu workspace… ")}
      </div>
    );
  const view = new URLSearchParams(window.location.search).get("view");
  const verifiedLogin =
    view === "login" &&
    new URLSearchParams(window.location.search).get("verified") === "1";
  function screen() {
    if (view === "terms" || view === "privacy")
      return <LegalPage privacy={view === "privacy"} />;
    if (
      ["verify", "reset", "recover"].includes(view || "") ||
      (!activationToken && !verifiedLogin && user?.emailVerified === false)
    )
      return (
        <EmailAccess
          mode={
            view === "reset"
              ? "reset"
              : view === "recover"
                ? "recover"
                : "verify"
          }
          token={emailToken}
          account={user}
        />
      );
    if (
      !activationToken &&
      !user &&
      !localMode &&
      !["login", "signup", "admin"].includes(view || "")
    )
      return <LandingPage onDemo={() => setLocalMode(true)} />;
    if (
      !activationToken &&
      !verifiedLogin &&
      user &&
      (user.access === false || view === "billing")
    )
      return (
        <BillingPage
          account={user}
          onLogout={() => {
            setUser(null);
            window.location.assign("/?view=login");
          }}
        />
      );
    if (activationToken || verifiedLogin || (!user && !localMode))
      return (
        <LoginScreen
          initialRegister={view === "signup"}
          verifiedEmail={verifiedLogin}
          configured={configured}
          hasSession={!!user}
          activationToken={activationToken}
          onClearActivation={() => setActivationToken(null)}
          onLocal={() => {
            setActivationToken(null);
            if (!user) {
              setLocalMode(true);
              setEntrance("Explorador");
            }
          }}
          onLogin={(account) => {
            if (verifiedLogin)
              window.history.replaceState(
                null,
                "",
                account.access ? "/" : "/?view=billing",
              );
            setActivationToken(null);
            setUser(account);
            setLocalMode(false);
            setEntrance(account.name);
          }}
        />
      );
    return (
      <>
        {entrance && (
          <WorkspaceEntrance name={entrance} onDone={finishEntrance} />
        )}
        <Suspense
          fallback={
            <div className="workspace-loading">
              <img
                src="/drivedata-logo.png"
                width={64}
                height={64}
                alt="DriveData"
              />
              <span>{translate("Abrindo sua área de trabalho…")}</span>
            </div>
          }
        >
          <Workspace
            key={`${user?.id || "local"}:${generation}`}
            storage={storage}
            account={user}
            onAccount={() =>
              user ? setAccountOpen(true) : setLocalMode(false)
            }
          />
        </Suspense>
        {accountOpen && (
          <AccountDialog
            user={user}
            onClose={() => setAccountOpen(false)}
            onChange={(next) => {
              setUser(next);
              if (!next) setLocalMode(false);
              setAccountOpen(false);
            }}
            onCopied={() => {
              setGeneration((g) => g + 1);
              setAccountOpen(false);
            }}
          />
        )}
      </>
    );
  }
  return (
    <>
      <LanguageSelector />
      {screen()}
      <HelpWidget account={user} />
    </>
  );
}
function AccountDialog({
  user,
  onClose,
  onChange,
  onCopied,
}: {
  user: Account | null;
  onClose: () => void;
  onChange: (u: Account | null) => void;
  onCopied: () => void;
}) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [localCount, setLocalCount] = useState<{
      sources: number;
      dashboards: number;
    } | null>(null);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  async function copyLocal() {
    const local = await loadWorkspace(),
      remote = cloudPersistence(user!.id),
      cloud = await remote.load();
    const ids = new Map(local.sources.map((s) => [s.id, crypto.randomUUID()]));
    await remote.save({
      ...cloud,
      sources: [
        ...cloud.sources,
        ...local.sources.map((s) => ({ ...s, id: ids.get(s.id)! })),
      ],
      dashboards: [
        ...cloud.dashboards,
        ...local.dashboards.map((d) => ({
          ...d,
          id: crypto.randomUUID(),
          sourceId: ids.get(d.sourceId) || d.sourceId,
        })),
      ],
    });
    onCopied();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        className="app-dialog account-dialog"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {user
              ? translate("Sua conta")
              : register
                ? translate("Crie sua conta")
                : translate("Entre no DriveVision")}
          </DialogTitle>
          <DialogDescription>
            {user
              ? translate(
                  "Fontes e dashboards salvos ficam disponíveis ao entrar em outro dispositivo.",
                )
              : translate(
                  "Salve suas análises na nuvem. Cada conta tem um workspace privado.",
                )}
          </DialogDescription>
        </DialogHeader>
        {user ? (
          <div className="account-stack">
            <div className="account-summary">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>
                <ShieldCheck size={14} />
                {translate(" Workspace privado na nuvem ")}
              </small>
            </div>
            <a className="primary-button" href="/?view=billing">
              {translate(" Minha assinatura ")}
            </a>
            <p className="model-note">
              {translate(
                " O modo local e a sua conta têm dados separados. Você pode copiar as análises salvas neste navegador para a conta. ",
              )}
            </p>
            {localCount ? (
              <>
                <p>
                  {localCount.sources} {translate(" bases e ")}
                  {localCount.dashboards}{" "}
                  {translate(
                    " dashboards serão copiados. Os itens já salvos na conta serão mantidos. ",
                  )}
                </p>
                <button
                  className="primary-button"
                  disabled={
                    busy || (!localCount.sources && !localCount.dashboards)
                  }
                  onClick={() => void run(copyLocal)}
                >
                  {translate(" Confirmar cópia para a conta ")}
                </button>
              </>
            ) : (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const w = await loadWorkspace();
                    setLocalCount({
                      sources: w.sources.length,
                      dashboards: w.dashboards.length,
                    });
                  })
                }
              >
                {translate(" Trazer análises deste navegador ")}
              </button>
            )}
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await apiJson("logout", {});
                  onChange(null);
                })
              }
            >
              <LogOut size={16} />
              {translate(" Sair da conta ")}
            </button>
          </div>
        ) : (
          <form
            className="account-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await apiJson<{ user: Account }>(
                  register ? "register" : "login",
                  { email, password, ...(register ? { name } : {}) },
                );
                setPassword("");
                onChange(result.user);
              });
            }}
          >
            {register && (
              <label>
                {translate(" Seu nome ")}
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            <label>
              {translate(" E-mail ")}
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </label>
            <label>
              {translate(" Senha ")}
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <p className="model-note">
              {translate(
                " Use pelo menos 12 caracteres. Nesta versão, ainda não há recuperação de senha por e-mail. ",
              )}
            </p>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : null}
              {register
                ? translate("Criar conta e entrar")
                : translate("Entrar")}
            </button>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setRegister((v) => !v);
                setError("");
              }}
            >
              {register
                ? translate("Já tenho conta")
                : translate("Criar uma conta")}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              {translate(" Continuar no modo local ")}
            </button>
          </form>
        )}
        {error && (
          <p className="model-error" role="alert">
            {translate(error)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
