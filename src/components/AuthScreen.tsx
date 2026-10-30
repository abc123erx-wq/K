import { useState } from "react";
import { Auth, type User } from "../game/auth";
import { Database, type PlayerSave, type LeaderboardEntry } from "../game/database";

interface AuthScreenProps {
  onLogin: (user: User, save: PlayerSave) => void;
}

type Mode = "login" | "register" | "leaderboard";

export default function AuthScreen({ onLogin }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Try to load saved users list from auth system (we can inspect localStorage directly)
  const savedUsers = (() => {
    try {
      const raw = localStorage.getItem("knox-users");
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map(u => ({ username: u.username, email: u.email, avatar: u.avatar })) : [];
      }
    } catch {}
    return [];
  })();

  const handleLogin = () => {
    setError(null);
    const result = Auth.login(username, password);
    if (!result.success || !result.user) {
      setError(result.error ?? "Erro desconhecido");
      return;
    }
    const save = Database.load(result.user.id, result.user.username);
    onLogin(result.user, save);
  };

  const handleRegister = () => {
    setError(null);
    const result = Auth.register(username, email, password);
    if (!result.success || !result.user) {
      setError(result.error ?? "Erro desconhecido");
      return;
    }
    const save = Database.load(result.user.id, result.user.username);
    onLogin(result.user, save);
  };

  const handleGuest = () => {
    const guest = Auth.guestLogin();
    const save = Database.load(guest.id, guest.username);
    onLogin(guest, save);
  };

  const leaderboard: LeaderboardEntry[] = Database.getLeaderboard();
  const userCount = Auth.getUserCount();

  return (
    <section className="relative min-h-screen bg-[radial-gradient(circle_at_35%_25%,#253321_0%,#111_42%,#050505_100%)]">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(#2a2a2a_1px,transparent_1px),linear-gradient(90deg,#2a2a2a_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-6 md:grid-cols-2">
          {/* Auth Card */}
          <div className="border border-[#2a2a2a] bg-[#0d0d0d] p-6 shadow-2xl shadow-black">
            <p className="mb-2 text-xs uppercase tracking-[0.4em] text-[#7f936f]">Day of the Undead</p>
            <h1 className="mb-4 text-3xl font-black uppercase leading-none text-[#d96b3a]">
              {mode === "login" ? "Login" : mode === "register" ? "Criar Conta" : "Leaderboard"}
            </h1>
            <p className="mb-6 text-xs text-zinc-500">
              {mode === "leaderboard"
                ? "Top sobreviventes do servidor"
                : "Seu progresso é salvo na nuvem (localStorage). Crie uma conta para subir de nível, ganhar XP e competir no leaderboard."}
            </p>

            {mode !== "leaderboard" && (
              <div className="space-y-3">
                {mode === "login" && savedUsers.length > 0 && (
                  <div className="mb-4 space-y-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-widest text-zinc-500">Contas Salvas</label>
                    <div className="flex flex-wrap gap-2">
                      {savedUsers.map((u, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setUsername(u.username);
                            setPassword(""); // clear password for safety, they must type it
                          }}
                          className={`flex items-center gap-2 border px-3 py-1.5 text-xs transition-colors ${
                            username === u.username ? "border-[#d96b3a] bg-[#2a1714]" : "border-[#2a2a2a] bg-black hover:border-[#4a5c45]"
                          }`}
                        >
                          <span>{u.avatar ?? "👤"}</span>
                          <span>{u.username}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-widest text-zinc-500">
                    {mode === "login" ? "Usuário ou Email" : "Nome de Usuário"}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={mode === "login" ? "seu_nome ou email@exemplo.com" : "ex: SurvivorPro"}
                    className="w-full border border-[#2a2a2a] bg-black px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                  />
                </div>
                {mode === "register" && (
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-widest text-zinc-500">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="w-full border border-[#2a2a2a] bg-black px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-widest text-zinc-500">Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (mode === "login" ? handleLogin() : handleRegister())}
                    placeholder="mín. 4 caracteres"
                    className="w-full border border-[#2a2a2a] bg-black px-3 py-2 text-sm text-zinc-200 outline-none focus:border-[#4a5c45]"
                  />
                </div>

                {error && (
                  <div className="border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-400">⚠️ {error}</div>
                )}

                <button
                  onClick={mode === "login" ? handleLogin : handleRegister}
                  className="w-full bg-[#8a2f22] py-3 text-sm font-black uppercase tracking-widest text-zinc-100 hover:bg-[#b5452e]"
                >
                  {mode === "login" ? "🔓 Entrar" : "✨ Criar Conta"}
                </button>
                <button
                  onClick={handleGuest}
                  className="w-full border border-[#2a2a2a] py-2 text-xs uppercase tracking-widest text-zinc-400 hover:bg-[#1f2521]"
                >
                  Jogar como Visitante (sem salvar)
                </button>
              </div>
            )}

            {mode === "leaderboard" && (
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {leaderboard.length === 0 ? (
                  <p className="text-center text-xs text-zinc-600">Nenhum jogador no ranking ainda</p>
                ) : (
                  leaderboard.map((entry, i) => (
                    <div key={entry.userId} className="flex items-center justify-between border-b border-[#1f2521] py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 text-center font-black ${i < 3 ? "text-[#d96b3a]" : "text-zinc-600"}`}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </span>
                        <span className="text-zinc-300">{entry.username}</span>
                      </div>
                      <div className="flex gap-3 text-zinc-500">
                        <span title="Level">Lv.<span className="text-[#cdd7bf]">{entry.level}</span></span>
                        <span title="Kills">💀 <span className="text-[#d7c9a7]">{entry.totalKills}</span></span>
                        <span title="PvP Kills">⚔️ <span className="text-red-400">{entry.pvpKills}</span></span>
                        <span title="Best days survived">📅 <span className="text-[#7f936f]">{entry.bestDaysSurvived}</span></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="mt-4 flex justify-center gap-3 text-xs">
              {mode !== "login" && <button onClick={() => { setError(null); setMode("login"); }} className="text-[#7f936f] hover:text-[#cdd7bf] underline">Login</button>}
              {mode !== "register" && <button onClick={() => { setError(null); setMode("register"); }} className="text-[#7f936f] hover:text-[#cdd7bf] underline">Registrar</button>}
              {mode !== "leaderboard" && <button onClick={() => { setError(null); setMode("leaderboard"); }} className="text-[#7f936f] hover:text-[#cdd7bf] underline">🏆 Ranking</button>}
            </div>
          </div>

          {/* Info Card */}
          <div className="space-y-4">
            <div className="border border-[#2a2a2a] bg-[#0d0d0d] p-6">
              <p className="mb-2 text-xs uppercase tracking-[0.4em] text-[#7f936f]">Survival Horror</p>
              <h2 className="mb-3 text-4xl font-black uppercase leading-none text-[#d96b3a]">Day of the<br />Undead</h2>
              <p className="mb-4 text-sm text-zinc-400">
                Sobreviva no apocalipse zumbi. Saqueie casas, dirija veículos, faça crafting, jogue com amigos online e mate outros jogadores no PvP.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-zinc-500">
                <div className="border border-[#1f2521] bg-black/40 p-2">
                  <div className="text-[#d96b3a]">{userCount}</div>
                  <div>Jogadores Registrados</div>
                </div>
                <div className="border border-[#1f2521] bg-black/40 p-2">
                  <div className="text-[#d96b3a]">{leaderboard.length}</div>
                  <div>No Ranking</div>
                </div>
              </div>
            </div>

            <div className="border border-[#2a2a2a] bg-[#0d0d0d] p-4">
              <h3 className="mb-3 text-xs uppercase tracking-widest text-[#7f936f]">⚙️ Recursos da Conta</h3>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li>✓ Progresso salvo automaticamente</li>
                <li>✓ Sistema de Level + XP</li>
                <li>✓ Estatísticas de PvP e PvE</li>
                <li>✓ Achievements desbloqueáveis</li>
                <li>✓ Leaderboard global</li>
                <li>✓ Export/Import de saves</li>
                <li>✓ Multi-personagens por conta</li>
              </ul>
            </div>

            <div className="border border-[#5a8aaa]/30 bg-[#1a2535]/50 p-4">
              <p className="text-[10px] uppercase tracking-widest text-blue-400">🔒 Privacidade</p>
              <p className="mt-1 text-xs text-zinc-400">
                Suas credenciais são armazenadas localmente no navegador. Nenhum dado é enviado para servidores externos por padrão.
                Senhas são protegidas com hash + salt.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
