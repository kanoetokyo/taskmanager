import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { isSupabaseAuthConfigured, supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { LoaderCircle, LogIn, MailCheck, ShieldAlert } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";

function AuthPanel({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {children}
      </section>
    </main>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    setIsSubmitting(true);
    setError("");
    setMessage("");

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    setIsSubmitting(false);
    if (signInError) {
      setError(
        "ログインリンクを送信できませんでした。メールアドレスを確認してもう一度お試しください。"
      );
      return;
    }

    setMessage(
      "ログインリンクをメールへ送信しました。メール内のリンクを開いてください。"
    );
  };

  if (!isSupabaseAuthConfigured) {
    return (
      <AuthPanel>
        <ShieldAlert className="size-7 text-rose-600" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">ログイン設定を確認中です</h1>
          <p className="text-sm leading-6 text-slate-600">
            管理者へ連絡してください。
          </p>
        </div>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel>
      <LogIn className="size-7 text-blue-600" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">タスク革命にログイン</h1>
        <p className="text-sm leading-6 text-slate-600">
          許可された管理者メールアドレスへ、1回限りのログインリンクを送信します。
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-medium" htmlFor="email">
          メールアドレス
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
          />
        </label>
        {error && (
          <p className="text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <MailCheck aria-hidden="true" />
          )}
          ログインリンクを送信
        </Button>
      </form>
    </AuthPanel>
  );
}

export function AuthCallback() {
  const [message, setMessage] = useState("ログインを確認しています。");

  useEffect(() => {
    const completeLogin = async () => {
      if (!supabase) {
        setMessage("ログイン設定を確認中です。");
        return;
      }

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMessage(
            "ログインの確認に失敗しました。もう一度ログインしてください。"
          );
          return;
        }
      }

      window.location.replace("/");
    };

    void completeLogin();
  }, []);

  return (
    <AuthPanel>
      <LoaderCircle
        className="size-7 animate-spin text-blue-600"
        aria-hidden="true"
      />
      <p className="text-sm text-slate-700" role="status">
        {message}
      </p>
    </AuthPanel>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: isReady && Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!isReady || (session && meQuery.isLoading)) {
    return (
      <AuthPanel>
        <LoaderCircle
          className="size-7 animate-spin text-blue-600"
          aria-hidden="true"
        />
        <p className="text-sm text-slate-700" role="status">
          ログインを確認しています。
        </p>
      </AuthPanel>
    );
  }

  if (!session) return <LoginPage />;

  if (meQuery.error || !meQuery.data) {
    return (
      <AuthPanel>
        <ShieldAlert className="size-7 text-rose-600" aria-hidden="true" />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            アクセスが許可されていません
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            このメールアドレスはタスク革命の管理者として登録されていません。
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void supabase?.auth
              .signOut()
              .finally(() => window.location.replace("/login"));
          }}
        >
          別のメールアドレスでログイン
        </Button>
      </AuthPanel>
    );
  }

  return <>{children}</>;
}
