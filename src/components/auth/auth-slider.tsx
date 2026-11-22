import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

type AuthSliderProps = {
  initialMode: "login" | "register";
  onLogin: (email: string, password: string) => void | Promise<void>;
  onRegister: (name: string, email: string, password: string) => void | Promise<void>;
  loading: boolean;
};

const FEED = [
  {
    org: "DOU · Seção 3",
    tag: "Licitação",
    tone: "amber",
    title: "Pregão eletrônico nº 41/2026 — aquisição de equipamentos de TI",
    score: "0,97",
  },
  {
    org: "DOE · São Paulo",
    tag: "Nomeação",
    tone: "teal",
    title: "Nomeia para o cargo de Analista de Sistemas, referência 12",
    score: "0,93",
  },
  {
    org: "DOM · Brasília",
    tag: "Contrato",
    tone: "ink",
    title: "Extrato de contrato — serviços de monitoramento de publicações",
    score: "0,88",
  },
] as const;

export function AuthSlider({ initialMode, onLogin, onRegister, loading }: AuthSliderProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [name, setName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onLogin(loginEmail, loginPassword);
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onRegister(name, regEmail, regPassword);
  };

  const today = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="dos-root">
      <style>{css}</style>

      <aside className="dos-paper" aria-hidden="true">
        <header className="dos-masthead">
          <span className="dos-kicker">Edição de {today}</span>
          <p className="dos-brand">
            Diário Oficial <em>Scanner</em>
          </p>
          <span className="dos-rule" />
        </header>

        <h2 className="dos-headline">
          Tudo o que sai nos diários oficiais, lido, classificado e entregue antes do café.
        </h2>
        <p className="dos-deck">
          Monitoramento do DOU, DOEs e DOMs com classificação por IA e alertas por WhatsApp e
          e-mail.
        </p>

        <ol className="dos-feed">
          {FEED.map((item, i) => (
            <li
              key={item.title}
              className="dos-item"
              style={{ animationDelay: `${0.15 + i * 0.12}s` }}
            >
              <div className="dos-item-head">
                <span className="dos-org">{item.org}</span>
                <span className={`dos-tag dos-tag--${item.tone}`}>{item.tag}</span>
              </div>
              <p className="dos-item-title">{item.title}</p>
              <span className="dos-score">confiança da IA {item.score}</span>
            </li>
          ))}
        </ol>

        <div className="dos-alert">
          <span className="dos-alert-dot" />
          <span>
            <strong>3 publicações relevantes</strong> enviadas para o seu WhatsApp às 06:02
          </span>
        </div>
      </aside>

      <main className="dos-panel">
        <div className="dos-card">
          <div className="dos-tabs" role="tablist" aria-label="Acesso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "is-on" : ""}
              onClick={() => setMode("login")}
              disabled={loading}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "is-on" : ""}
              onClick={() => setMode("register")}
              disabled={loading}
            >
              Criar conta
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="dos-form" key="login">
              <h1>Bom dia de leitura.</h1>
              <p className="dos-sub">Entre para ver o que foi publicado hoje.</p>
              <label className="dos-field">
                <span>E-mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@orgao.gov.br"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </label>
              <label className="dos-field">
                <span className="dos-field-row">
                  Senha
                  <Link to="/forgot-password" className="dos-link">
                    Esqueci minha senha
                  </Link>
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </label>
              <button type="submit" className="dos-btn" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="dos-form" key="register">
              <h1>Assine o seu scanner.</h1>
              <p className="dos-sub">Crie a conta e escolha os termos que quer monitorar.</p>
              <label className="dos-field">
                <span>Nome</span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                />
              </label>
              <label className="dos-field">
                <span>E-mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="voce@orgao.gov.br"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </label>
              <label className="dos-field">
                <span>Senha</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo de 8 caracteres"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </label>
              <button type="submit" className="dos-btn" disabled={loading}>
                {loading ? "Criando..." : "Criar conta"}
              </button>
            </form>
          )}

          <p className="dos-foot">DOU · DOEs · DOMs — atualizado a cada edição</p>
        </div>
      </main>
    </div>
  );
}

const css = `
.dos-root {
  --paper: #f4efe4;
  --paper-2: #ebe4d4;
  --ink: #1b2430;
  --ink-2: #4a5462;
  --ink-3: #7c8492;
  --line: #d8cfbb;
  --accent: #b4532a;
  --teal: #1f6f6b;
  --amber: #a8701d;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  min-height: 100vh;
  background: #fbf9f4;
  color: var(--ink);
  font-family: var(--sans);
}

/* ---------- jornal ---------- */
.dos-paper {
  position: relative;
  padding: 44px clamp(32px, 5vw, 80px) 36px;
  background:
    radial-gradient(1200px 600px at 0% 0%, rgba(255,255,255,.55), transparent 60%),
    repeating-linear-gradient(0deg, rgba(27,36,48,.025) 0 1px, transparent 1px 3px),
    var(--paper);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 22px;
  overflow: hidden;
}
.dos-masthead { display: grid; gap: 6px; }
.dos-kicker {
  font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--ink-3);
}
.dos-brand {
  margin: 0; font-family: var(--serif); font-size: 30px; font-weight: 700; letter-spacing: -.01em;
}
.dos-brand em { font-style: italic; font-weight: 400; color: var(--accent); }
.dos-rule {
  display: block; height: 0; margin-top: 10px;
  border-top: 3px double var(--ink);
}
.dos-headline {
  margin: 0; max-width: 18ch;
  font-family: var(--serif); font-weight: 700;
  font-size: clamp(30px, 3.4vw, 48px); line-height: 1.08; letter-spacing: -.02em;
}
.dos-deck {
  margin: -8px 0 0; max-width: 46ch;
  font-family: var(--serif); font-size: 17px; line-height: 1.5; color: var(--ink-2);
}
.dos-feed {
  list-style: none; margin: 4px 0 0; padding: 0;
  display: grid; gap: 12px; max-width: 560px;
}
.dos-item {
  background: #fffdf8;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 14px 16px;
  box-shadow: 0 1px 0 rgba(27,36,48,.04), 0 8px 20px -14px rgba(27,36,48,.25);
  opacity: 0; transform: translateY(8px);
  animation: dos-in .5s ease forwards;
}
.dos-item-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.dos-org { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
.dos-tag {
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; letter-spacing: .02em;
}
.dos-tag--amber { color: var(--amber); background: rgba(168,112,29,.12); }
.dos-tag--teal { color: var(--teal); background: rgba(31,111,107,.12); }
.dos-tag--ink { color: var(--ink); background: rgba(27,36,48,.08); }
.dos-item-title { margin: 8px 0 6px; font-family: var(--serif); font-size: 16px; line-height: 1.35; }
.dos-score { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.dos-alert {
  margin-top: auto; align-self: flex-start;
  display: inline-flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 999px;
  background: var(--ink); color: #f4efe4; font-size: 13px;
}
.dos-alert strong { font-weight: 600; }
.dos-alert-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #3ddc84;
  box-shadow: 0 0 0 4px rgba(61,220,132,.2);
}

/* ---------- formulário ---------- */
.dos-panel {
  display: grid; place-items: center;
  padding: 48px clamp(20px, 4vw, 64px);
}
.dos-card { width: 100%; max-width: 400px; }
.dos-tabs {
  display: grid; grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--line); margin-bottom: 32px;
}
.dos-tabs button {
  appearance: none; background: none; border: 0; cursor: pointer;
  padding: 12px 0; font: 600 14px var(--sans); color: var(--ink-3);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color .2s, border-color .2s;
}
.dos-tabs button.is-on { color: var(--ink); border-bottom-color: var(--accent); }
.dos-tabs button:disabled { cursor: not-allowed; }
.dos-form { display: grid; gap: 18px; animation: dos-in .35s ease; }
.dos-form h1 {
  margin: 0; font-family: var(--serif); font-size: 32px; font-weight: 700; letter-spacing: -.02em;
}
.dos-sub { margin: -10px 0 6px; color: var(--ink-2); font-size: 15px; }
.dos-field { display: grid; gap: 7px; }
.dos-field > span { font-size: 13px; font-weight: 600; color: var(--ink); }
.dos-field-row { display: flex; justify-content: space-between; align-items: baseline; }
.dos-field input {
  width: 100%; height: 46px; padding: 0 14px;
  background: #fff; color: var(--ink);
  border: 1px solid var(--line); border-radius: 6px;
  font: 15px var(--sans); outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.dos-field input::placeholder { color: #a9afb8; }
.dos-field input:focus { border-color: var(--ink); box-shadow: 0 0 0 3px rgba(27,36,48,.08); }
.dos-link { font-size: 12.5px; font-weight: 500; color: var(--ink-2); text-decoration: none; }
.dos-link:hover { color: var(--accent); text-decoration: underline; }
.dos-btn {
  height: 48px; margin-top: 6px; border: 0; border-radius: 6px; cursor: pointer;
  background: var(--ink); color: #f8f4ea; font: 600 15px var(--sans);
  transition: background .2s, transform .05s;
}
.dos-btn:hover:not(:disabled) { background: #0f1620; }
.dos-btn:active:not(:disabled) { transform: translateY(1px); }
.dos-btn:disabled { opacity: .6; cursor: not-allowed; }
.dos-foot {
  margin: 28px 0 0; text-align: center;
  font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-3);
}

@keyframes dos-in { to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .dos-item, .dos-form { animation: none; opacity: 1; transform: none; }
}

@media (max-width: 900px) {
  .dos-root { grid-template-columns: 1fr; }
  .dos-paper { border-right: 0; border-bottom: 1px solid var(--line); padding: 32px 20px; gap: 18px; }
  .dos-headline { font-size: 28px; }
  .dos-feed .dos-item:nth-child(n + 2), .dos-deck { display: none; }
  .dos-alert { margin-top: 0; }
  .dos-panel { padding: 32px 20px 48px; }
}
`;
