import { createMiddleware } from "@tanstack/react-start";
import { usuarioAtual } from "@/lib/sessao.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const usuario = await usuarioAtual();
  if (!usuario) throw new Error("Sessão expirada");
  return next({ context: { userId: usuario.id } });
});
