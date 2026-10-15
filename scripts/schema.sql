CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sessoes (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessoes_user_idx ON public.sessoes(user_id);

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  aliquota_simples_padrao numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clientes_user_idx ON public.clientes(user_id);

CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, nome)
);

CREATE TABLE IF NOT EXISTS public.vendas_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  marketplace text NOT NULL DEFAULT 'N/D',
  mes text NOT NULL,
  sku text NOT NULL,
  nome_produto text NOT NULL DEFAULT '',
  fornecedor text,
  unidades numeric NOT NULL DEFAULT 0,
  receita numeric NOT NULL DEFAULT 0,
  custo numeric,
  tarifa_venda numeric NOT NULL DEFAULT 0,
  tarifa_envio numeric NOT NULL DEFAULT 0,
  receita_envio numeric NOT NULL DEFAULT 0,
  cupom numeric NOT NULL DEFAULT 0,
  comissao_afiliado numeric NOT NULL DEFAULT 0,
  frete_entrega_direta numeric NOT NULL DEFAULT 0,
  cancelamentos numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  data_venda date,
  estado text
);
CREATE INDEX IF NOT EXISTS vendas_produto_cliente_mes_idx ON public.vendas_produto (cliente_id, mes);

CREATE TABLE IF NOT EXISTS public.despesas_fixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes text NOT NULL,
  nome text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parametros_mensais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  mes text NOT NULL,
  aliquota_simples_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS parametros_mensais_cliente_mes_empresa_uidx
  ON public.parametros_mensais (cliente_id, mes, empresa_id)
  WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS parametros_mensais_cliente_mes_geral_uidx
  ON public.parametros_mensais (cliente_id, mes)
  WHERE empresa_id IS NULL;
