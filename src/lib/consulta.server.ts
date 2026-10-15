import { db, serializar } from "./pg.server";

type Filtro =
  | { t: "eq"; col: string; val?: unknown }
  | { t: "in"; col: string; val?: unknown }
  | { t: "notnull"; col: string }
  | { t: "isnull"; col: string };

export type PedidoConsulta = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  columns: string | null;
  order: string | null;
  orderAsc: boolean;
  filters: Filtro[];
  values?: unknown;
  onConflict: string | null;
  single: "none" | "maybe" | "one";
  returning: boolean;
  rangeFrom: number | null;
  rangeTo: number | null;
};

const TABELAS: Record<string, { cols: string[]; dono: "user" | "cliente" }> = {
  clientes: {
    cols: ["id", "user_id", "nome", "aliquota_simples_padrao", "created_at"],
    dono: "user",
  },
  empresas: {
    cols: ["id", "cliente_id", "nome", "created_at"],
    dono: "cliente",
  },
  vendas_produto: {
    cols: [
      "id", "cliente_id", "empresa_id", "marketplace", "mes", "sku", "nome_produto", "fornecedor",
      "unidades", "receita", "custo", "tarifa_venda", "tarifa_envio", "receita_envio", "cupom",
      "comissao_afiliado", "frete_entrega_direta", "cancelamentos", "created_at", "data_venda", "estado",
    ],
    dono: "cliente",
  },
  despesas_fixas: {
    cols: ["id", "cliente_id", "empresa_id", "mes", "nome", "valor", "created_at"],
    dono: "cliente",
  },
  parametros_mensais: {
    cols: ["id", "cliente_id", "mes", "aliquota_simples_pct", "created_at", "empresa_id"],
    dono: "cliente",
  },
};

function tabelaDe(nome: string) {
  const tabela = TABELAS[nome];
  if (!tabela) throw new Error("Tabela não permitida");
  return tabela;
}

function colunaDe(tabela: { cols: string[] }, col: string) {
  if (!tabela.cols.includes(col)) throw new Error("Coluna não permitida");
  return col;
}

function linhasDe(values: unknown, userId: string, cols: string[], dono: "user" | "cliente") {
  const lista = Array.isArray(values) ? values : [values];
  if (lista.length === 0) return [];
  if (lista.length > 500) throw new Error("Lote maior que 500 linhas");
  return lista.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Linha inválida");
    const origem = item as Record<string, unknown>;
    const linha: Record<string, unknown> = {};
    if (dono === "user") linha["user_id"] = userId;
    for (const [chave, valor] of Object.entries(origem)) {
      if (chave === "user_id") continue;
      if (!cols.includes(chave)) throw new Error("Coluna não permitida");
      linha[chave] = valor;
    }
    return linha;
  });
}

function listaSql(sql: ReturnType<typeof db>, partes: any[]) {
  return partes.slice(1).reduce((acc, parte) => sql`${acc}, ${parte}`, partes[0]);
}

function onde(sql: ReturnType<typeof db>, userId: string, table: string, dono: "user" | "cliente", filters: Filtro[], cols: string[]) {
  const partes: any[] = dono === "user"
    ? [sql`user_id = ${userId}`]
    : [sql`cliente_id IN (SELECT id FROM clientes WHERE user_id = ${userId})`];
  for (const filtro of filters) {
    const col = colunaDe({ cols }, filtro.col);
    if (filtro.t === "eq") partes.push(sql`${sql(col)} = ${filtro.val as any}`);
    else if (filtro.t === "notnull") partes.push(sql`${sql(col)} IS NOT NULL`);
    else if (filtro.t === "isnull") partes.push(sql`${sql(col)} IS NULL`);
    else if (filtro.t === "in") {
      const vals = Array.isArray(filtro.val) ? filtro.val : [];
      if (vals.length === 0) partes.push(sql`false`);
      else partes.push(sql`${sql(col)} IN ${sql(vals as any[])}`);
    }
  }
  return partes.reduce((acc, parte) => sql`${acc} AND ${parte}`);
}

function colunasSelect(sql: ReturnType<typeof db>, pedido: string | null, cols: string[]) {
  if (!pedido || pedido.trim() === "*") return sql`*`;
  const nomes = pedido.split(",").map((nome) => colunaDe({ cols }, nome.trim()));
  return listaSql(sql, nomes.map((nome) => sql(nome)));
}

function forma(linhas: unknown[], single: PedidoConsulta["single"]) {
  if (single === "maybe") {
    if (linhas.length > 1) throw new Error("Mais de um registro");
    return linhas[0] ?? null;
  }
  if (single === "one") {
    if (linhas.length !== 1) throw new Error(linhas.length === 0 ? "Registro não encontrado" : "Mais de um registro");
    return linhas[0];
  }
  return linhas;
}

export async function executarConsulta(userId: string, pedido: PedidoConsulta) {
  const tabela = tabelaDe(pedido.table);
  const sql = db();
  const nome = sql(pedido.table);

  if (pedido.op === "select") {
    if (pedido.order) colunaDe(tabela, pedido.order);
    const ordem = pedido.order
      ? pedido.orderAsc
        ? sql`ORDER BY ${sql(pedido.order)} ASC`
        : sql`ORDER BY ${sql(pedido.order)} DESC`
      : sql``;
    let limite = sql``;
    if (pedido.rangeFrom != null && pedido.rangeTo != null) {
      const de = Math.max(0, pedido.rangeFrom);
      const ate = Math.max(de, pedido.rangeTo);
      limite = sql`LIMIT ${ate - de + 1} OFFSET ${de}`;
    }
    const rows = await sql`SELECT ${colunasSelect(sql, pedido.columns, tabela.cols)} FROM ${nome} WHERE ${onde(sql, userId, pedido.table, tabela.dono, pedido.filters, tabela.cols)} ${ordem} ${limite}`;
    return serializar(forma([...rows], pedido.single));
  }

  if (pedido.op === "delete") {
    await sql`DELETE FROM ${nome} WHERE ${onde(sql, userId, pedido.table, tabela.dono, pedido.filters, tabela.cols)}`;
    return null;
  }

  if (pedido.op === "update") {
    const [linha] = linhasDe(pedido.values, userId, tabela.cols, tabela.dono);
    if (!linha) throw new Error("Nada para atualizar");
    const chaves = Object.keys(linha).filter((chave) => chave !== "user_id" && chave !== "id");
    if (chaves.length === 0) return null;
    await sql`UPDATE ${nome} SET ${sql(linha, ...chaves)} WHERE ${onde(sql, userId, pedido.table, tabela.dono, pedido.filters, tabela.cols)}`;
    return null;
  }

  const linhas = linhasDe(pedido.values, userId, tabela.cols, tabela.dono);
  if (tabela.dono === "cliente") {
    const ids = [...new Set(linhas.map((linha) => String(linha["cliente_id"] ?? "")))];
    if (ids.some((id) => !id || id === "undefined")) throw new Error("Cliente ausente");
    const ok = (await sql`SELECT id FROM clientes WHERE user_id = ${userId} AND id IN ${sql(ids)}`) as Array<{ id: string }>;
    if (ok.length !== ids.length) throw new Error("Cliente não encontrado");
  }
  if (linhas.length === 0) return pedido.returning ? forma([], pedido.single) : null;
  const chaves = [...new Set(linhas.flatMap((linha) => Object.keys(linha)))];
  const completas = linhas.map((linha) => {
    const cheia: Record<string, unknown> = {};
    for (const chave of chaves) cheia[chave] = linha[chave] ?? null;
    return cheia;
  });

  if (pedido.op === "insert") {
    const rows = await sql`INSERT INTO ${nome} ${sql(completas, ...chaves)} RETURNING *`;
    return pedido.returning ? serializar(forma([...rows], pedido.single)) : null;
  }

  throw new Error("Operação não suportada");
}
