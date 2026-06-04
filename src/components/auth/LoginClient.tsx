"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { login } from "@/lib/api/auth-api";

function normalizeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/map";
  }

  return value;
}

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ username, password });
      router.replace(normalizeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof ApiError
          ? loginError.message
          : "Не удалось выполнить вход. Попробуйте еще раз."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <CardHeader className="auth-card-header">
          <Image
            alt=""
            aria-hidden="true"
            className="auth-logo"
            height="56"
            priority
            src="/brand/logo.png"
            width="56"
          />
          <div>
            <p className="eyebrow">ПВЗ Органайзер</p>
            <h1 className="auth-title">Вход</h1>
          </div>
        </CardHeader>
        <CardContent>
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <Label htmlFor="username">Логин</Label>
              <Input
                autoComplete="username"
                id="username"
                inputMode="text"
                name="username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </div>
            <div className="auth-field">
              <Label htmlFor="password">Пароль</Label>
              <Input
                autoComplete="current-password"
                id="password"
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            {error ? (
              <p className="auth-error" role="status">
                {error}
              </p>
            ) : null}
            <Button className="auth-submit" disabled={isSubmitting} size="lg" type="submit">
              <LogIn />
              {isSubmitting ? "Входим..." : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
