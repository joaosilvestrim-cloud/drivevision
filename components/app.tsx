"use client";
import { useEffect, useMemo, useState } from "react";
import { Cloud, Loader2, LogOut, ShieldCheck } from "lucide-react";
import Workspace from "./workspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  apiJson,
  cloudPersistence,
  localPersistence,
  type Account,
} from "@/lib/cloud-workspace";
import { loadWorkspace } from "@/lib/local-workspace";

export default function App() {
  const [user, setUser] = useState<Account | null>(null),
    [checking, setChecking] = useState(true),
    [accountOpen, setAccountOpen] = useState(false),
    [generation, setGeneration] = useState(0);
  const storage = useMemo(
    () => (user ? cloudPersistence() : localPersistence),
    [user, generation],
  );
  useEffect(() => {
    let live = true;
    apiJson<{ configured: boolean }>("status")
      .then(async (status) => {
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
      <div className="account-loading">
        <Loader2 className="spin" />
        Abrindo seu workspace…
      </div>
    );
  return (
    <>
      <Workspace
        key={`${user?.id || "local"}:${generation}`}
        storage={storage}
        account={user}
        onAccount={() => setAccountOpen(true)}
      />
      {accountOpen && (
        <AccountDialog
          user={user}
          onClose={() => setAccountOpen(false)}
          onChange={(next) => {
            setUser(next);
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
      remote = cloudPersistence(),
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
          <div className="model-eyebrow">
            <Cloud size={16} />
            SEU WORKSPACE, COM VOCÊ
          </div>
          <DialogTitle>
            {user
              ? "Sua conta"
              : register
                ? "Crie sua conta"
                : "Entre no DriveVision"}
          </DialogTitle>
          <DialogDescription>
            {user
              ? "Fontes e dashboards salvos ficam disponíveis ao entrar em outro dispositivo."
              : "Salve suas análises na nuvem. Cada conta tem um workspace privado."}
          </DialogDescription>
        </DialogHeader>
        {user ? (
          <div className="account-stack">
            <div className="account-summary">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
              <small>
                <ShieldCheck size={14} />
                Workspace privado na nuvem
              </small>
            </div>
            <p className="model-note">
              O modo local e a sua conta têm dados separados. Você pode copiar
              as análises salvas neste navegador para a conta.
            </p>
            {localCount ? (
              <>
                <p>
                  {localCount.sources} bases e {localCount.dashboards}{" "}
                  dashboards serão copiados. Os itens já salvos na conta serão
                  mantidos.
                </p>
                <button
                  className="primary-button"
                  disabled={
                    busy || (!localCount.sources && !localCount.dashboards)
                  }
                  onClick={() => void run(copyLocal)}
                >
                  Confirmar cópia para a conta
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
                Trazer análises deste navegador
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
              Sair para o modo local
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
                Seu nome
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
              E-mail
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
              Senha
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
              Use pelo menos 12 caracteres. Nesta versão, ainda não há
              recuperação de senha por e-mail.
            </p>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : null}
              {register ? "Criar conta e entrar" : "Entrar"}
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
              {register ? "Já tenho conta" : "Criar uma conta"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Continuar no modo local
            </button>
          </form>
        )}
        {error && (
          <p className="model-error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
