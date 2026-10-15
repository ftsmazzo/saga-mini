import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { executarConsulta, type PedidoConsulta } from "./consulta.server";
import { abrirSessao, confereSenha, encerrarSessao, hashSenha, usuarioAtual } from "./sessao.server";
import { db } from "./pg.server";

const credenciais = z.object({
  email: z.string().trim().email().max(200),
  senha: z.string().min(6).max(200),
});

const filtro = z.object({
  t: z.enum(["eq", "in", "notnull", "isnull"]),
  col: z.string().max(64),
  val: z.unknown().optional(),
});

const pedido = z.object({
  table: z.string().max(64),
  op: z.enum(["select", "insert", "update", "delete", "upsert"]),
  columns: z.string().max(500).nullable(),
  order: z.string().max(64).nullable(),
  orderAsc: z.boolean(),
  filters: z.array(filtro).max(20),
  values: z.unknown().optional(),
  onConflict: z.string().max(120).nullable(),
  single: z.enum(["none", "maybe", "one"]),
  returning: z.boolean(),
  rangeFrom: z.number().nullable(),
  rangeTo: z.number().nullable(),
});

function emailDe(email: string) {
  return email.trim().toLowerCase();
}

export const eu = createServerFn({ method: "GET" }).handler(async () => usuarioAtual());

export const entrar = createServerFn({ method: "POST" })
  .inputValidator((dados: unknown) => credenciais.parse(dados))
  .handler(async ({ data }) => {
    const email = emailDe(data.email);
    const rows = (await db()`
      SELECT id, senha_hash FROM usuarios WHERE email = ${email} LIMIT 1
    `) as Array<{ id: string; senha_hash: string }>;
    const usuario = rows[0];
    if (!usuario || !confereSenha(data.senha, usuario.senha_hash)) {
      return { error: "E-mail ou senha incorretos." };
    }
    await abrirSessao(usuario.id);
    return { error: null };
  });

export const criarConta = createServerFn({ method: "POST" })
  .inputValidator((dados: unknown) => credenciais.parse(dados))
  .handler(async ({ data }) => {
    const email = emailDe(data.email);
    try {
      const rows = (await db()`
        INSERT INTO usuarios (email, senha_hash)
        VALUES (${email}, ${hashSenha(data.senha)})
        RETURNING id
      `) as Array<{ id: string }>;
      const criado = rows[0];
      if (!criado) return { error: "Não foi possível criar a conta." };
      await abrirSessao(criado.id);
      return { error: null };
    } catch (erro) {
      const codigo = (erro as { code?: string }).code;
      if (codigo === "23505") return { error: "Já existe uma conta com esse e-mail." };
      console.error(erro);
      return { error: "Não foi possível criar a conta." };
    }
  });

export const sair = createServerFn({ method: "POST" }).handler(async () => {
  await encerrarSessao();
  return { ok: true };
});

export const consultar = createServerFn({ method: "POST" })
  .inputValidator((dados: unknown) => pedido.parse(dados))
  .handler(async ({ data }) => {
    const usuario = await usuarioAtual();
    if (!usuario) return { data: null, error: { message: "Sessão expirada" } };
    try {
      const linhas = (await executarConsulta(usuario.id, data as PedidoConsulta)) as null;
      return { data: linhas, error: null as null };
    } catch (erro) {
      console.error(erro);
      const mensagem = erro instanceof Error ? erro.message : "Falha ao gravar";
      return { data: null, error: { message: mensagem } };
    }
  });
