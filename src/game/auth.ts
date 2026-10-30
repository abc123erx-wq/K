// ============================================================
// AUTH SYSTEM — Login, Register, Session Management
// Supports: localStorage (offline) + Firebase Auth (cloud)
// ============================================================

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: number;
  lastLogin: number;
  avatar?: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number;
}

const STORAGE_KEY_USERS = "knox-users";
const STORAGE_KEY_SESSION = "knox-session";
const SESSION_DURATION = 1000 * 60 * 60 * 24 * 30; // 30 days

// Simple hash function (NOT cryptographically secure, but better than plaintext)
function hashPassword(password: string, salt: string): string {
  let hash = 0;
  const str = password + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + "_" + salt.slice(0, 8);
}

function generateToken(): string {
  return `tok_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function generateId(): string {
  return `usr_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// User Storage (localStorage backed)
// ============================================================
interface StoredUser extends User {
  passwordHash: string;
  salt: string;
}

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

// ============================================================
// Public API
// ============================================================

export const Auth = {
  /** Register a new user */
  register(username: string, email: string, password: string): { success: boolean; error?: string; user?: User } {
    if (username.length < 3) return { success: false, error: "Nome deve ter pelo menos 3 caracteres" };
    if (password.length < 4) return { success: false, error: "Senha deve ter pelo menos 4 caracteres" };
    if (!email.includes("@")) return { success: false, error: "Email inválido" };

    const users = loadUsers();
    if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return { success: false, error: "Nome de usuário já existe" };
    }
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: "Email já registrado" };
    }

    const salt = Math.random().toString(36).slice(2);
    const user: StoredUser = {
      id: generateId(),
      username,
      email,
      passwordHash: hashPassword(password, salt),
      salt,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      avatar: `🧟`,
    };

    users.push(user);
    saveUsers(users);

    // Auto-login
    const session: AuthSession = {
      user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin, avatar: user.avatar },
      token: generateToken(),
      expiresAt: Date.now() + SESSION_DURATION,
    };
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

    return { success: true, user: session.user };
  },

  /** Login with username/email + password */
  login(usernameOrEmail: string, password: string): { success: boolean; error?: string; user?: User } {
    const users = loadUsers();
    const user = users.find(
      (u) =>
        u.username.toLowerCase() === usernameOrEmail.toLowerCase() ||
        u.email.toLowerCase() === usernameOrEmail.toLowerCase(),
    );

    if (!user) return { success: false, error: "Usuário não encontrado" };

    const inputHash = hashPassword(password, user.salt);
    if (inputHash !== user.passwordHash) {
      return { success: false, error: "Senha incorreta" };
    }

    user.lastLogin = Date.now();
    saveUsers(users);

    const session: AuthSession = {
      user: { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt, lastLogin: user.lastLogin, avatar: user.avatar },
      token: generateToken(),
      expiresAt: Date.now() + SESSION_DURATION,
    };
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

    return { success: true, user: session.user };
  },

  /** Login as guest (no persistence) */
  guestLogin(): User {
    const guest: User = {
      id: `guest_${Math.random().toString(36).slice(2, 8)}`,
      username: `Guest_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      email: "guest@local",
      createdAt: Date.now(),
      lastLogin: Date.now(),
      avatar: "👤",
    };
    const session: AuthSession = { user: guest, token: generateToken(), expiresAt: Date.now() + SESSION_DURATION };
    sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    return guest;
  },

  /** Get current session */
  getSession(): AuthSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION) || sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      const session = JSON.parse(raw) as AuthSession;
      if (session.expiresAt < Date.now()) {
        Auth.logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  /** Check if logged in */
  isLoggedIn(): boolean {
    return Auth.getSession() !== null;
  },

  /** Get current user */
  getCurrentUser(): User | null {
    return Auth.getSession()?.user ?? null;
  },

  /** Logout */
  logout() {
    localStorage.removeItem(STORAGE_KEY_SESSION);
    sessionStorage.removeItem(STORAGE_KEY_SESSION);
  },

  /** Get total registered users */
  getUserCount(): number {
    return loadUsers().length;
  },

  /** Delete current account permanently */
  deleteAccount(password: string): { success: boolean; error?: string } {
    const session = Auth.getSession();
    if (!session) return { success: false, error: "Não logado" };
    const users = loadUsers();
    const user = users.find((u) => u.id === session.user.id);
    if (!user) return { success: false, error: "Usuário não encontrado" };
    if (hashPassword(password, user.salt) !== user.passwordHash) {
      return { success: false, error: "Senha incorreta" };
    }
    const filtered = users.filter((u) => u.id !== session.user.id);
    saveUsers(filtered);
    Auth.logout();
    return { success: true };
  },
};
