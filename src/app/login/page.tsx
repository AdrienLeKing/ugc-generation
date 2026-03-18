"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getBrowserSupabase();

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Auto-login after signup (Supabase confirms immediately if email confirm is off)
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError("Compte cree. Connectez-vous.");
        setMode("login");
        setLoading(false);
        return;
      }
    } else {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }
    }

    // Redirect to home — middleware will allow access now
    window.location.href = "/";
  }

  return (
    <main className="login-shell">
      <div className="page-backdrop" />
      <div className="login-card">
        <div className="login-header">
          <span className="eyebrow">Sora Vertical Studio</span>
          <h1>{mode === "login" ? "Connexion" : "Creer un compte"}</h1>
          <p>
            {mode === "login"
              ? "Connectez-vous pour acceder a vos generations."
              : "Creez un compte pour commencer a generer."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={loading}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Mot de passe</span>
            <input
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              disabled={loading}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="6 caracteres minimum"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="error-box">{error}</p> : null}

          <button className="primary-button login-submit" disabled={loading} type="submit">
            {loading
              ? "Chargement..."
              : mode === "login"
                ? "Se connecter"
                : "Creer le compte"}
          </button>
        </form>

        <button
          className="login-toggle"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          type="button"
        >
          {mode === "login"
            ? "Pas encore de compte ? Creer un compte"
            : "Deja un compte ? Se connecter"}
        </button>
      </div>
    </main>
  );
}
