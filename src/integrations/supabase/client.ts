import { consultar, criarConta, entrar, eu, sair } from "@/lib/conta.functions";

type Filtro =
  | { t: "eq"; col: string; val?: unknown }
  | { t: "in"; col: string; val?: unknown }
  | { t: "notnull"; col: string }
  | { t: "isnull"; col: string };

type Estado = {
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

type Linha = {
  id: any; user_id: any; nome: any; aliquota_simples_padrao: any; created_at: any; cliente_id: any;
  empresa_id: any; marketplace: any; mes: any; sku: any; nome_produto: any; fornecedor: any;
  unidades: any; receita: any; custo: any; tarifa_venda: any; tarifa_envio: any; receita_envio: any;
  cupom: any; comissao_afiliado: any; frete_entrega_direta: any; cancelamentos: any; data_venda: any;
  estado: any; valor: any; aliquota_simples_pct: any;
};
type Resposta<T> = { data: T; error: { message: string } | null };
type Sessao = { user: { id: string; email: string }; access_token: string };
type Ouvinte = (evento: "SIGNED_IN" | "SIGNED_OUT", sessao: Sessao | null) => void;

function executar(estado: Estado): Promise<Resposta<any>> {
  return consultar({ data: estado }) as Promise<Resposta<any>>;
}

const ouvintes = new Set<Ouvinte>();

async function sessaoAtual(): Promise<Sessao | null> {
  try {
    const user = await eu();
    return user ? { user, access_token: "cookie" } : null;
  } catch {
    return null;
  }
}

async function avisar(evento: "SIGNED_IN" | "SIGNED_OUT") {
  const sessao = evento === "SIGNED_OUT" ? null : await sessaoAtual();
  for (const ouvinte of ouvintes) ouvinte(evento, sessao);
}

function respostaDe<T>(estado: Estado) {
  return {
    then<TResult1 = Resposta<T>, TResult2 = never>(
      resolve?: ((value: Resposta<T>) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return executar(estado).then(resolve as (value: Resposta<any>) => TResult1 | PromiseLike<TResult1>, reject);
    },
  };
}

function consulta(table: string) {
  const estado: Estado = {
    table,
    op: "select",
    columns: null,
    order: null,
    orderAsc: true,
    filters: [],
    onConflict: null,
    single: "none",
    returning: false,
    rangeFrom: null,
    rangeTo: null,
  };
  const self = {
    select(cols?: string) {
      if (estado.op === "select") estado.columns = cols ?? "*";
      else estado.returning = true;
      return self;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      estado.order = col;
      estado.orderAsc = opts?.ascending !== false;
      return self;
    },
    eq(col: string, val: unknown) {
      estado.filters.push({ t: "eq", col, val });
      return self;
    },
    in(col: string, val: unknown[]) {
      estado.filters.push({ t: "in", col, val });
      return self;
    },
    is(col: string, val: unknown) {
      if (val === null) estado.filters.push({ t: "isnull", col });
      return self;
    },
    not(col: string, op: string, val: unknown) {
      if (op === "is" && val === null) estado.filters.push({ t: "notnull", col });
      return self;
    },
    range(de: number, ate: number) {
      estado.rangeFrom = de;
      estado.rangeTo = ate;
      return self;
    },
    insert(values: unknown) {
      estado.op = "insert";
      estado.values = values;
      return self;
    },
    update(values: unknown) {
      estado.op = "update";
      estado.values = values;
      return self;
    },
    delete() {
      estado.op = "delete";
      return self;
    },
    upsert(values: unknown, opts?: { onConflict?: string }) {
      estado.op = "upsert";
      estado.values = values;
      estado.onConflict = opts?.onConflict ?? null;
      return self;
    },
    maybeSingle() {
      estado.single = "maybe";
      return respostaDe<Linha | null>(estado);
    },
    single() {
      estado.single = "one";
      return respostaDe<Linha>(estado);
    },
    then<TResult1 = Resposta<Linha[] | null>, TResult2 = never>(
      resolve?: ((value: Resposta<Linha[] | null>) => TResult1 | PromiseLike<TResult1>) | null,
      reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return executar(estado).then(resolve as (value: Resposta<any>) => TResult1 | PromiseLike<TResult1>, reject);
    },
  };
  return self;
}

export const supabase = {
  from: consulta,
  auth: {
    async getUser() {
      const user = await eu().catch(() => null);
      return { data: { user }, error: null as null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const resposta = await entrar({ data: { email, senha: password } });
      if (resposta.error) return { error: { message: resposta.error } };
      await avisar("SIGNED_IN");
      return { error: null };
    },
    async signUp({ email, password }: { email: string; password: string; options?: { emailRedirectTo?: string } }) {
      const resposta = await criarConta({ data: { email, senha: password } });
      if (resposta.error) return { error: { message: resposta.error } };
      await avisar("SIGNED_IN");
      return { error: null };
    },
    async signOut() {
      await sair();
      await avisar("SIGNED_OUT");
    },
    onAuthStateChange(callback: (evento: string, sessao: Sessao | null) => void) {
      const ouvinte: Ouvinte = (evento, sessao) => callback(evento, sessao);
      ouvintes.add(ouvinte);
      return { data: { subscription: { unsubscribe() { ouvintes.delete(ouvinte); } } } };
    },
    async getSession() {
      return { data: { session: await sessaoAtual() } };
    },
    async setSession(_tokens?: unknown) {
      return { data: { session: await sessaoAtual() }, error: null as null };
    },
  },
};
