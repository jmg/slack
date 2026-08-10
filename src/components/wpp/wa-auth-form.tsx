"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { reportGaSignUpBeforeNavigation } from "@/lib/ga4";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch } from "@/lib/wpp/client";
import { WPP_API, wpp } from "@/lib/wpp/config";

/**
 * Sign in / sign up with a phone number.
 *
 * ## Why a password and not an SMS code
 * WhatsApp verifies a number by texting it. This clone has no SMS gateway, and
 * the honest alternatives — printing the code on screen, or emailing it — are
 * either not a verification at all or not a phone-based identity. So the phone
 * number is the *identity* (unique, E.164, unchangeable) and a password is the
 * *credential*. Everything downstream — contacts by number, "message yourself",
 * privacy per contact — behaves exactly as it does in WhatsApp.
 */
export function WaAuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const isRegister = mode === "register";

  /**
   * Only ever follow a `next` that points back into this app. An absolute URL —
   * or a path belonging to the Slack half — would turn the login screen into an
   * open redirect.
   */
  function safeNext(): string {
    const raw = searchParams.get("next");
    if (!raw) return wpp("/chats");
    return raw.startsWith(`${wpp()}/`) ? raw : wpp("/chats");
  }

  function withNext(path: string): string {
    const raw = searchParams.get("next");
    return raw ? `${path}?next=${encodeURIComponent(raw)}` : path;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await wppFetch(`${WPP_API}/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        json: isRegister ? { name, phone, password } : { phone, password },
      });
      const navigate = () => {
        router.push(safeNext());
        router.refresh();
      };
      if (isRegister) {
        reportGaSignUpBeforeNavigation("phone", navigate);
      } else {
        navigate();
      }
    } catch (err) {
      toast.error(wppError(err, t));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-medium text-[var(--wa-text)]">
          {t(isRegister ? "auth.register.title" : "auth.login.title", {
            app: t("app.name"),
          })}
        </h1>
        <p className="text-sm text-[var(--wa-text-dim)]">
          {t(isRegister ? "auth.register.subtitle" : "auth.login.subtitle", {
            app: t("app.name"),
          })}
        </p>
      </div>

      {isRegister && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wa-name">{t("auth.name")}</Label>
          <Input
            id="wa-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("auth.namePlaceholder")}
            autoComplete="name"
            maxLength={60}
            required
            className="h-10"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-phone">{t("auth.phone")}</Label>
        <Input
          id="wa-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 11 2345 6789"
          autoComplete="tel"
          required
          className="h-10"
        />
        <p className="text-xs text-[var(--wa-text-dim)]">{t("auth.phoneHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-password">{t("auth.password")}</Label>
        <Input
          id="wa-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          className="h-10"
        />
        {isRegister && (
          <p className="text-xs text-[var(--wa-text-dim)]">
            {t("auth.passwordHint")}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="h-10 w-full bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
      >
        {loading
          ? t("common.loading")
          : isRegister
            ? t("auth.signUp")
            : t("auth.signIn")}
      </Button>

      <p className="text-center text-sm text-[var(--wa-text-dim)]">
        {isRegister ? t("auth.haveAccount") : t("auth.noAccount", { app: t("app.name") })}{" "}
        <Link
          href={withNext(wpp(isRegister ? "/login" : "/register"))}
          className="font-medium text-[var(--wa-link)] underline-offset-4 hover:underline"
        >
          {isRegister ? t("auth.signIn") : t("auth.signUp")}
        </Link>
      </p>
    </form>
  );
}
