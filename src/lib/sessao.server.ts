import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { db } from "./pg.server";

const COOKIE = "mini_sessao";
const DIAS = 30;

export type Usuario = { id: string; email: string };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashSenha(senha: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function confereSenha(senha: string, armazenada: string) {
  const [, salt, hash] = armazenada.split(":");
  if (!salt || !hash) return false;
  const atual = scryptSync(senha, salt, 32);
  const esperado = Buffer.from(hash, "hex");
  if (atual.length !== esperado.length) return false;
  return timingSafeEqual(atual, esperado);
}

export async function usuarioAtual(): Promise<Usuario | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const rows = (await db()`
    SELECT u.id, u.email
    FROM sessoes s
    JOIN usuarios u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > now()
    LIMIT 1
  `) as Array<Usuario>;
  return rows[0] ?? null;
}

export async function abrirSessao(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + DIAS * 24 * 60 * 60 * 1000);
  await db()`
    INSERT INTO sessoes (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, ${expira})
  `;
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 24 * 60 * 60,
  });
}

export async function encerrarSessao() {
  const token = getCookie(COOKIE);
  if (token) await db()`DELETE FROM sessoes WHERE token_hash = ${hashToken(token)}`;
  deleteCookie(COOKIE, { path: "/" });
}
