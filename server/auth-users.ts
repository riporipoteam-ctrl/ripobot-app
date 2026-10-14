// Public user accounts: signup/login with email+password, session tokens.
// Users get isolated data (their own bots/threads). Stored in DATA_DIR/users.json.
// Passwords hashed with scrypt. No external dependencies.
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string; // scrypt hash, format: salt:hash
  createdAt: number;
  isAdmin?: boolean;
}

export interface PublicSession {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

const USERS_FILE = "users.json";
const SESSIONS_FILE = "user-sessions.json";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function usersPath(dataDir: string): string {
  return join(dataDir, USERS_FILE);
}

function sessionsPath(dataDir: string): string {
  return join(dataDir, SESSIONS_FILE);
}

function loadUsers(dataDir: string): PublicUser[] {
  const path = usersPath(dataDir);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveUsers(dataDir: string, users: PublicUser[]): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(usersPath(dataDir), JSON.stringify(users, null, 2));
}

function loadSessions(dataDir: string): PublicSession[] {
  const path = sessionsPath(dataDir);
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveSessions(dataDir: string, sessions: PublicSession[]): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(sessionsPath(dataDir), JSON.stringify(sessions, null, 2));
}

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) {
      resolve(false);
      return;
    }
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      try {
        const keyBuffer = Buffer.from(key, "hex");
        const derivedBuffer = Buffer.from(derivedKey.toString("hex"), "hex");
        // timingSafeEqual requires same length
        if (keyBuffer.length !== derivedBuffer.length) {
          resolve(false);
          return;
        }
        resolve(timingSafeEqual(keyBuffer, derivedBuffer));
      } catch {
        resolve(false);
      }
    });
  });
}

export async function createUser(
  dataDir: string,
  email: string,
  password: string,
  name: string,
): Promise<{ user?: PublicUser; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { error: "Invalid email address" };
  }
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (!name || !name.trim()) {
    return { error: "Name is required" };
  }

  const users = loadUsers(dataDir);
  if (users.some((u) => u.email === normalizedEmail)) {
    return { error: "An account with this email already exists" };
  }

  // Check if this email is an admin (via RIPO_ADMIN_EMAILS env var, comma-separated)
  const adminEmails = (process.env.RIPO_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(normalizedEmail);

  const passwordHash = await hashPassword(password);
  const user: PublicUser = {
    id: `u_${randomBytes(12).toString("hex")}`,
    email: normalizedEmail,
    name: name.trim(),
    passwordHash,
    createdAt: Date.now(),
    ...(isAdmin ? { isAdmin: true } : {}),
  };
  users.push(user);
  saveUsers(dataDir, users);
  return { user };
}

export async function verifyUser(
  dataDir: string,
  email: string,
  password: string,
): Promise<{ user?: PublicUser; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const users = loadUsers(dataDir);
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return { error: "Invalid email or password" };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Invalid email or password" };
  }
  return { user };
}

export function createSession(dataDir: string, userId: string): PublicSession {
  const sessions = loadSessions(dataDir);
  // Clean expired
  const now = Date.now();
  const valid = sessions.filter((s) => s.expiresAt > now);
  
  const session: PublicSession = {
    token: randomBytes(32).toString("hex"),
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  valid.push(session);
  saveSessions(dataDir, valid);
  return session;
}

export function getSession(dataDir: string, token: string): { session?: PublicSession; user?: PublicUser } {
  if (!token) return {};
  const sessions = loadSessions(dataDir);
  const session = sessions.find((s) => s.token === token);
  if (!session || session.expiresAt < Date.now()) {
    return {};
  }
  const users = loadUsers(dataDir);
  const user = users.find((u) => u.id === session.userId);
  if (!user) return {};
  return { session, user };
}

export function destroySession(dataDir: string, token: string): void {
  const sessions = loadSessions(dataDir);
  const filtered = sessions.filter((s) => s.token !== token);
  saveSessions(dataDir, filtered);
}

export function getUserById(dataDir: string, userId: string): PublicUser | undefined {
  const users = loadUsers(dataDir);
  return users.find((u) => u.id === userId);
}
