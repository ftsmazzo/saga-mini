import postgres from "postgres";

let sql: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!sql) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL ausente");
    sql = postgres(url, {
      max: 5,
      types: {
        date: {
          to: 1082,
          from: [1082],
          serialize: (valor: string) => valor.slice(0, 10),
          parse: (valor: string) => valor,
        },
      },
    });
  }
  return sql;
}

export function serializar<T>(valor: T): T {
  if (valor instanceof Date) return valor.toISOString() as T;
  if (Array.isArray(valor)) return valor.map((item) => serializar(item)) as T;
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor)) saida[chave] = serializar(item);
    return saida as T;
  }
  return valor;
}
