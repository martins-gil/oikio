-- =====================================================================
-- APP DA CASA — Modelo de dados (PostgreSQL / Supabase)
-- Versão 1 · setembro 2026
--
-- Pressupõe o Supabase, que já fornece:
--   auth.users  (utilizadores autenticados)
--   auth.uid()  (id do utilizador que faz o pedido)
--
-- Organização:
--   1. Tipos (enums)
--   2. Casa e membros
--   3. Tarefas (casa, pessoal, contas, manutenção)
--   4. Stock, compras e talões
--   5. Refeições
--   6. Finanças e horas
--   7. Lógica automática (consumo FEFO, lista de compras, tarefas)
--   8. Vistas para os ecrãs
--   9. Segurança por linha (RLS)
--  10. Dados de referência
-- =====================================================================


-- gen_random_bytes() (convites) vem do pgcrypto; no Supabase já está no schema extensions
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;


-- =====================================================================
-- 1. TIPOS
-- =====================================================================

create type member_role       as enum ('admin', 'adult', 'child');
create type task_scope        as enum ('home', 'personal', 'bills', 'maintenance');
-- Os 4 tipos de periodicidade identificados na tua lista (+ tarefa única):
--   times_per_period    → "aspirar 2x semana", "varandas 1x mês"
--   interval_since_last → "lavar cabelo de 3 em 3 dias" (conta desde a última vez)
--   fixed_schedule      → "pagar condomínio dia 8" (regra de calendário, RRULE)
--   no_frequency        → "cabeleireiro", "unhas" (mostra há quantos dias foi)
--   once                → tarefa pontual
create type recurrence_type   as enum ('times_per_period', 'interval_since_last',
                                       'fixed_schedule', 'no_frequency', 'once');
create type period_unit       as enum ('day', 'week', 'month', 'year');
create type assignment_mode   as enum ('fixed', 'rotation', 'balanced', 'free');
create type occurrence_status as enum ('pending', 'done', 'skipped');
create type swap_status       as enum ('pending', 'accepted', 'declined');
create type location_kind     as enum ('fridge', 'freezer', 'pantry', 'cleaning', 'bathroom', 'other');
create type expiry_source     as enum ('estimated', 'printed', 'barcode_2d', 'manual');
create type movement_reason   as enum ('purchase', 'consumption', 'task', 'waste', 'adjustment', 'move');
create type receipt_status    as enum ('processing', 'to_confirm', 'confirmed', 'error');
create type list_reason       as enum ('manual', 'min_stock', 'recipe');
create type gamification_mode as enum ('off', 'weekly_summary', 'competition');
create type time_entry_kind   as enum ('hour_bank', 'appointment', 'other');
-- Stock exato (conta unidades) ou por nível (Cheio / Meio / Quase a acabar)
create type stock_tracking    as enum ('exact', 'level');


-- =====================================================================
-- 2. CASA E MEMBROS
-- =====================================================================

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_emoji  text,
  created_at    timestamptz not null default now()
);

create table households (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  timezone           text not null default 'Europe/Lisbon',
  week_starts_on     smallint not null default 1 check (week_starts_on between 0 and 6), -- 1 = segunda
  gamification       gamification_mode not null default 'weekly_summary',
  food_preferences   text,            -- texto livre enviado à IA ("sem coentros", "pouca carne")
  plan               text not null default 'free' check (plan in ('free', 'premium')),
  created_at         timestamptz not null default now()
);

create table household_members (
  household_id        uuid not null references households(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  role                member_role not null default 'adult',
  daily_summary_time  time not null default '08:30',   -- um único resumo diário
  joined_at           timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by    uuid not null references auth.users(id),
  expires_at    timestamptz not null default now() + interval '7 days',
  used_by       uuid references auth.users(id),
  used_at       timestamptz
);

-- Divisões da casa (opcional; organiza tarefas e equipamentos)
create table rooms (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,           -- "Cozinha", "Casa de banho", "Varanda"
  unique (household_id, name)
);

-- Equipamentos (robot aspirador, esquentador, frigorífico…)
create table appliances (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  room_id         uuid references rooms(id) on delete set null,
  name            text not null,
  brand           text,
  model           text,
  serial_number   text,
  purchase_date   date,
  warranty_until  date,
  manual_url      text,
  notes           text                   -- ex.: medida do filtro, peças compatíveis
);


-- =====================================================================
-- 3. TAREFAS
-- =====================================================================

create table tasks (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households(id) on delete cascade,
  scope               task_scope not null default 'home',
  -- Tarefas pessoais pertencem a uma pessoa e são PRIVADAS (ver RLS)
  owner_user_id       uuid references auth.users(id) on delete cascade,
  title               text not null,
  notes               text,
  room_id             uuid references rooms(id) on delete set null,
  appliance_id        uuid references appliances(id) on delete set null,

  -- Periodicidade
  recurrence          recurrence_type not null,
  times_per_period    smallint,           -- para times_per_period
  period              period_unit,        -- para times_per_period
  interval_days       smallint,           -- para interval_since_last
  rrule               text,               -- para fixed_schedule (formato iCal, ex.: 'FREQ=MONTHLY;BYMONTHDAY=8')
  reminder_lead_days  smallint not null default 0,   -- avisar X dias antes (útil em pagamentos)

  -- Atribuição (ver discussão: fixo / rotação / equilíbrio / livre)
  assignment          assignment_mode not null default 'balanced',
  fixed_assignee      uuid references auth.users(id) on delete set null,
  effort_points       smallint not null default 1 check (effort_points between 1 and 10),

  -- Pagamentos (scope = 'bills')
  amount_cents        integer,
  currency            char(3) not null default 'EUR',

  -- Estado desnormalizado (atualizado por trigger) para o indicador verde→vermelho
  last_done_at        timestamptz,

  is_active           boolean not null default true,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),

  -- Regras de coerência
  constraint personal_needs_owner
    check (scope <> 'personal' or owner_user_id is not null),
  constraint personal_is_not_shared
    check (scope <> 'personal' or assignment = 'fixed'),
  constraint fixed_needs_assignee
    check (assignment <> 'fixed' or fixed_assignee is not null or owner_user_id is not null),
  constraint recurrence_fields check (
       (recurrence = 'times_per_period'    and times_per_period > 0 and period is not null)
    or (recurrence = 'interval_since_last' and interval_days > 0)
    or (recurrence = 'fixed_schedule'      and rrule is not null)
    or (recurrence in ('no_frequency', 'once'))
  )
);
create index on tasks (household_id) where is_active;

-- Ordem de rotação (assignment = 'rotation')
create table task_rotation (
  task_id   uuid not null references tasks(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  position  smallint not null,
  primary key (task_id, user_id),
  unique (task_id, position)
);

-- Cada ocorrência concreta de uma tarefa (o que aparece no ecrã "Hoje")
create table task_occurrences (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references tasks(id) on delete cascade,
  household_id    uuid not null references households(id) on delete cascade,
  due_date        date not null,
  assigned_to     uuid references auth.users(id) on delete set null,  -- null = livre
  status          occurrence_status not null default 'pending',
  completed_at    timestamptz,
  completed_by    uuid references auth.users(id) on delete set null,
  points_awarded  smallint,
  unique (task_id, due_date)
);
create index on task_occurrences (household_id, due_date) where status = 'pending';
create index on task_occurrences (completed_by, completed_at) where status = 'done';

-- Pedido de troca ("arrastar para o outro")
create table task_swap_requests (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references task_occurrences(id) on delete cascade,
  from_user      uuid not null references auth.users(id) on delete cascade,
  to_user        uuid not null references auth.users(id) on delete cascade,
  status         swap_status not null default 'pending',
  created_at     timestamptz not null default now(),
  answered_at    timestamptz
);

-- Pontos de agradecimento
create table kudos (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  from_user      uuid not null references auth.users(id) on delete cascade,
  to_user        uuid not null references auth.users(id) on delete cascade,
  occurrence_id  uuid references task_occurrences(id) on delete set null,
  points         smallint not null default 1 check (points between 1 and 5),
  message        text,
  created_at     timestamptz not null default now(),
  check (from_user <> to_user)
);


-- =====================================================================
-- 4. STOCK, COMPRAS E TALÕES
-- =====================================================================

create table storage_locations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,              -- "Frigorífico", "Arca da garagem"
  kind          location_kind not null,
  unique (household_id, name)
);

-- Categorias de referência (globais, iguais para todas as casas)
create table product_categories (
  id                        smallint primary key,
  name                      text not null unique,
  default_location          location_kind not null,
  default_shelf_life_days   smallint,        -- preencher a partir de fonte de referência
  frozen_shelf_life_days    smallint,
  is_food                   boolean not null default true
);

create table products (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  name          text not null,
  brand         text,
  category_id   smallint references product_categories(id),
  -- Unidade base: tudo é contado nesta unidade ('rolo', 'dose', 'ml', 'g', 'un')
  base_unit     text not null default 'un',
  min_stock     numeric(10,2) not null default 0,   -- em unidades base; 0 = não vigiar
  -- Modo "level": o utilizador só diz Cheio / Meio / Quase a acabar.
  -- Por baixo, a app continua a contar em unidades base a partir de full_quantity
  -- (quanto vale "cheio"), para que o desconto pelas tarefas funcione na mesma.
  tracking_mode stock_tracking not null default 'exact',
  full_quantity numeric(10,2),
  notes         text,
  created_at    timestamptz not null default now(),
  unique (household_id, name, brand),
  constraint level_needs_full_quantity
    check (tracking_mode <> 'level' or full_quantity > 0)
);

-- Modelos para o onboarding progressivo: "Quais destes acabam sempre sem darem conta?"
-- Quantidades são estimativas genéricas, editáveis pelo utilizador.
create table product_templates (
  id                      smallint primary key,
  name                    text not null unique,
  emoji                   text,
  category_id             smallint references product_categories(id),
  base_unit               text not null,
  full_quantity           numeric(10,2) not null,   -- quanto vale "cheio" (uma embalagem típica)
  task_title              text,                     -- tarefa que o consome
  task_times_per_period   smallint,
  task_period             period_unit,
  consumption_per_task    numeric(10,2)
);

-- Embalagens: "Pack 6 rolos" = 6 unidades base. O código de barras vive aqui.
create table product_packages (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id) on delete cascade,
  name               text not null,
  units_per_package  numeric(10,2) not null check (units_per_package > 0),
  gtin               text,               -- EAN/UPC ou GTIN lido de código 2D
  unique (product_id, name)
);
create index on product_packages (gtin);

create table receipts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  uploaded_by   uuid references auth.users(id) on delete set null,
  store_name    text,
  purchased_at  date,
  total_cents   integer,
  image_path    text,                    -- caminho no Supabase Storage
  status        receipt_status not null default 'processing',
  ai_model      text,                    -- modelo usado (para poderes trocar de modelo)
  ai_raw        jsonb,                   -- resposta bruta da IA, para depuração
  created_at    timestamptz not null default now()
);

create table receipt_lines (
  id                  uuid primary key default gen_random_uuid(),
  receipt_id          uuid not null references receipts(id) on delete cascade,
  raw_text            text not null,       -- "BIFE PERU PD 500G"
  product_id          uuid references products(id) on delete set null,  -- associação confirmada
  package_id          uuid references product_packages(id) on delete set null,
  quantity            numeric(10,2) not null default 1,  -- nº de embalagens
  unit_price_cents    integer,
  total_cents         integer,
  suggested_location  location_kind,
  confirmed           boolean not null default false
);

-- Lotes: cada compra de um produto é um lote com validade própria
create table stock_lots (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  location_id    uuid references storage_locations(id) on delete set null,
  quantity       numeric(10,2) not null check (quantity >= 0),   -- restante, em unidades base
  expiry_date    date,
  expiry_source  expiry_source,
  batch          text,
  receipt_id     uuid references receipts(id) on delete set null,
  opened_at      date,
  frozen_at      date,
  created_at     timestamptz not null default now()
);
create index on stock_lots (product_id, expiry_date) where quantity > 0;
create index on stock_lots (household_id, expiry_date) where quantity > 0;

-- Histórico de todas as entradas e saídas (também mede o desperdício)
create table stock_movements (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  lot_id         uuid references stock_lots(id) on delete set null,
  delta          numeric(10,2) not null,       -- + entrada, − saída (unidades base)
  reason         movement_reason not null,
  occurrence_id  uuid references task_occurrences(id) on delete set null,
  user_id        uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- A ponte tarefa ↔ consumível: "Lavar roupa" gasta 1 dose de detergente
create table task_consumptions (
  task_id     uuid not null references tasks(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  quantity    numeric(10,2) not null check (quantity > 0),   -- unidades base por execução
  primary key (task_id, product_id)
);

create table shopping_list_items (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  product_id    uuid references products(id) on delete cascade,
  free_text     text,                    -- para coisas sem produto criado
  quantity      numeric(10,2),
  reason        list_reason not null default 'manual',
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  checked_at    timestamptz,
  check (product_id is not null or free_text is not null)
);
-- No máximo um item por produto por riscar
create unique index one_open_item_per_product
  on shopping_list_items (household_id, product_id)
  where checked_at is null and product_id is not null;


-- =====================================================================
-- 5. REFEIÇÕES
-- =====================================================================

create table meal_suggestions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  requested_by  uuid references auth.users(id) on delete set null,
  meal          text check (meal in ('almoço', 'jantar', 'outro')),
  ai_model      text,
  context       jsonb,   -- stock enviado (priorizando o que expira primeiro)
  response      jsonb,   -- 2–3 sugestões + o que falta comprar
  chosen_index  smallint,
  created_at    timestamptz not null default now()
);


-- =====================================================================
-- 6. FINANÇAS E HORAS
-- =====================================================================

create table expenses (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  paid_by        uuid not null references auth.users(id) on delete cascade,
  is_shared      boolean not null default true,   -- false = só visível para quem pagou
  amount_cents   integer not null,
  currency       char(3) not null default 'EUR',
  category       text,
  description    text,
  spent_on       date not null default current_date,
  receipt_id     uuid references receipts(id) on delete set null,
  occurrence_id  uuid references task_occurrences(id) on delete set null,  -- ex.: pagamento do condomínio
  created_at     timestamptz not null default now()
);
create index on expenses (household_id, spent_on);

-- Banco de horas e horas em consultas: sempre PRIVADO de cada pessoa
create table time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          time_entry_kind not null,
  label         text,                     -- ex.: nome da consulta ou do projeto
  entry_date    date not null default current_date,
  minutes       integer not null,         -- banco de horas: + crédito, − gozo
  notes         text,
  created_at    timestamptz not null default now()
);
create index on time_entries (user_id, kind, entry_date);


-- =====================================================================
-- 7. LÓGICA AUTOMÁTICA
-- =====================================================================

-- Pertença à casa (security definer evita recursão nas políticas RLS)
create or replace function is_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members
                 where household_id = h and user_id = auth.uid());
$$;

-- Admin da casa (security definer pelo mesmo motivo que is_member)
create or replace function is_admin(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_members
                 where household_id = h and user_id = auth.uid() and role = 'admin');
$$;

-- Criar casa e ficar logo como admin
create or replace function create_household(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sessão em falta'; end if;
  -- Garante o perfil de quem cria a casa (display_name é obrigatório)
  insert into profiles (id, display_name)
  values (auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Eu'))
  on conflict (id) do nothing;
  insert into households (name) values (p_name) returning id into v_id;
  insert into household_members (household_id, user_id, role) values (v_id, auth.uid(), 'admin');
  insert into storage_locations (household_id, name, kind) values
    (v_id, 'Frigorífico', 'fridge'), (v_id, 'Congelador', 'freezer'),
    (v_id, 'Despensa', 'pantry'),    (v_id, 'Produtos de limpeza', 'cleaning');
  return v_id;
end $$;

-- Aceitar convite (link enviado por WhatsApp)
create or replace function accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv household_invites%rowtype;
begin
  select * into v_inv from household_invites
   where token = p_token and used_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Convite inválido ou expirado'; end if;
  insert into household_members (household_id, user_id) values (v_inv.household_id, auth.uid())
    on conflict do nothing;
  update household_invites set used_by = auth.uid(), used_at = now() where id = v_inv.id;
  return v_inv.household_id;
end $$;

-- Stock total de um produto
create or replace function product_stock(p_product uuid)
returns numeric language sql stable as $$
  select coalesce(sum(quantity), 0) from stock_lots where product_id = p_product;
$$;

-- Se o stock ficou abaixo do mínimo, põe o produto na lista de compras
create or replace function refill_shopping_list(p_product uuid)
returns void language plpgsql as $$
declare v_p products%rowtype;
begin
  select * into v_p from products where id = p_product;
  if v_p.min_stock > 0 and product_stock(p_product) < v_p.min_stock then
    insert into shopping_list_items (household_id, product_id, quantity, reason)
    values (v_p.household_id, p_product, v_p.min_stock - product_stock(p_product), 'min_stock')
    on conflict (household_id, product_id) where checked_at is null and product_id is not null
    do nothing;
  elsif v_p.min_stock > 0 then
    -- Stock reposto: risca os itens que tinham sido adicionados automaticamente
    update shopping_list_items set checked_at = now()
     where product_id = p_product and checked_at is null and reason = 'min_stock';
  end if;
end $$;

-- Entrada de stock (compra, scan, talão confirmado)
create or replace function add_stock(
  p_product uuid, p_qty numeric, p_location uuid default null,
  p_expiry date default null, p_expiry_source expiry_source default null,
  p_receipt uuid default null)
returns uuid language plpgsql as $$
declare v_household uuid; v_lot uuid;
begin
  select household_id into v_household from products where id = p_product;
  insert into stock_lots (household_id, product_id, location_id, quantity,
                          expiry_date, expiry_source, receipt_id)
  values (v_household, p_product, p_location, p_qty, p_expiry, p_expiry_source, p_receipt)
  returning id into v_lot;
  insert into stock_movements (household_id, product_id, lot_id, delta, reason, user_id)
  values (v_household, p_product, v_lot, p_qty, 'purchase', auth.uid());
  return v_lot;
end $$;

-- Fixar o stock por nível (modo "level"): 'full' | 'half' | 'low' | 'empty'.
-- Zera os lotes existentes (movimento de ajuste) e cria um lote com a fração de full_quantity.
create or replace function set_stock_level(p_product uuid, p_level text)
returns void language plpgsql as $$
declare
  v_p        products%rowtype;
  v_fraction numeric;
  v_target   numeric;
  v_current  numeric;
  v_lot      uuid;
begin
  select * into v_p from products where id = p_product;
  if v_p.full_quantity is null then
    raise exception 'O produto % não tem full_quantity definido', v_p.name;
  end if;
  v_fraction := case p_level when 'full' then 1.0 when 'half' then 0.5
                             when 'low'  then 0.15 when 'empty' then 0
                             else null end;
  if v_fraction is null then raise exception 'Nível inválido: %', p_level; end if;

  v_target  := round(v_p.full_quantity * v_fraction, 2);
  v_current := product_stock(p_product);

  -- Zerar lotes atuais
  insert into stock_movements (household_id, product_id, lot_id, delta, reason, user_id)
  select household_id, product_id, id, -quantity, 'adjustment', auth.uid()
    from stock_lots where product_id = p_product and quantity > 0;
  update stock_lots set quantity = 0 where product_id = p_product and quantity > 0;

  -- Novo lote com o nível indicado
  if v_target > 0 then
    insert into stock_lots (household_id, product_id, quantity, expiry_source)
    values (v_p.household_id, p_product, v_target, 'manual')
    returning id into v_lot;
    insert into stock_movements (household_id, product_id, lot_id, delta, reason, user_id)
    values (v_p.household_id, p_product, v_lot, v_target, 'adjustment', auth.uid());
  end if;

  perform refill_shopping_list(p_product);
end $$;

-- Onboarding num só passo: cria produto + tarefa ligada + consumo + nível atual.
-- Devolve o id do produto.
create or replace function onboard_from_template(
  p_household uuid, p_template smallint, p_level text default 'half')
returns uuid language plpgsql as $$
declare
  v_t       product_templates%rowtype;
  v_product uuid;
  v_task    uuid;
begin
  select * into v_t from product_templates where id = p_template;
  if not found then raise exception 'Modelo inexistente'; end if;

  insert into products (household_id, name, category_id, base_unit,
                        tracking_mode, full_quantity, min_stock)
  values (p_household, v_t.name, v_t.category_id, v_t.base_unit,
          'level', v_t.full_quantity, round(v_t.full_quantity * 0.25, 2))
  returning id into v_product;

  if v_t.task_title is not null then
    -- Reaproveita a tarefa se já existir (ex.: dois produtos gastos em "Lavar roupa")
    select id into v_task from tasks
     where household_id = p_household and title = v_t.task_title and scope = 'home'
     limit 1;
    if v_task is null then
      insert into tasks (household_id, title, recurrence, times_per_period, period, created_by)
      values (p_household, v_t.task_title, 'times_per_period',
              v_t.task_times_per_period, v_t.task_period, auth.uid())
      returning id into v_task;
    end if;
    insert into task_consumptions (task_id, product_id, quantity)
    values (v_task, v_product, v_t.consumption_per_task)
    on conflict do nothing;
  end if;

  perform set_stock_level(v_product, p_level);
  return v_product;
end $$;

-- Saída de stock pelo método FEFO (primeiro o que expira primeiro).
-- Devolve a quantidade que ficou por descontar (stock insuficiente).
create or replace function consume_product(
  p_product uuid, p_qty numeric, p_reason movement_reason,
  p_occurrence uuid default null, p_user uuid default null)
returns numeric language plpgsql as $$
declare
  v_remaining numeric := p_qty;
  v_take      numeric;
  v_lot       record;
begin
  for v_lot in
    select id, household_id, quantity from stock_lots
     where product_id = p_product and quantity > 0
     order by expiry_date nulls last, created_at
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.quantity, v_remaining);
    update stock_lots set quantity = quantity - v_take where id = v_lot.id;
    insert into stock_movements (household_id, product_id, lot_id, delta, reason, occurrence_id, user_id)
    values (v_lot.household_id, p_product, v_lot.id, -v_take, p_reason, p_occurrence,
            coalesce(p_user, auth.uid()));
    v_remaining := v_remaining - v_take;
  end loop;
  perform refill_shopping_list(p_product);
  return greatest(v_remaining, 0);
end $$;

-- Quando uma tarefa é marcada como feita:
--   1) atualiza last_done_at (indicador verde→vermelho)
--   2) desconta os consumíveis associados
--   3) atribui pontos
create or replace function on_occurrence_done()
returns trigger language plpgsql as $$
declare v_c record;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid());
    select effort_points into new.points_awarded from tasks where id = new.task_id;

    update tasks set last_done_at = new.completed_at where id = new.task_id;

    for v_c in select product_id, quantity from task_consumptions where task_id = new.task_id loop
      perform consume_product(v_c.product_id, v_c.quantity, 'task', new.id, new.completed_by);
    end loop;
  end if;
  return new;
end $$;

create trigger trg_occurrence_done
  before update of status on task_occurrences
  for each row execute function on_occurrence_done();


-- =====================================================================
-- 8. VISTAS PARA OS ECRÃS
-- =====================================================================

-- Stock por produto, com alerta de mínimo e validade mais próxima
create view v_stock with (security_invoker = true) as
select p.id as product_id, p.household_id, p.name, p.base_unit, p.min_stock,
       p.tracking_mode,
       coalesce(sum(l.quantity), 0)                               as total,
       coalesce(sum(l.quantity), 0) < p.min_stock                 as below_min,
       min(l.expiry_date) filter (where l.quantity > 0)           as next_expiry,
       -- Rótulo para produtos em modo "level"
       case when p.tracking_mode = 'level' then
         case when coalesce(sum(l.quantity), 0) <= 0                     then 'empty'
              when coalesce(sum(l.quantity), 0) >= p.full_quantity * 0.66 then 'full'
              when coalesce(sum(l.quantity), 0) >= p.full_quantity * 0.30 then 'half'
              else 'low' end
       end                                                        as level
  from products p
  left join stock_lots l on l.product_id = p.id
 group by p.id;

-- Estado das tarefas por intervalo: 0 = acabada de fazer (verde), ≥1 = em atraso (vermelho)
create view v_task_urgency with (security_invoker = true) as
select t.id as task_id, t.household_id, t.title, t.recurrence, t.last_done_at,
       case
         when t.recurrence = 'interval_since_last' and t.last_done_at is not null
           then round((extract(epoch from now() - t.last_done_at) / 86400.0 / t.interval_days)::numeric, 2)
         when t.recurrence = 'times_per_period' and t.last_done_at is not null
           then round((extract(epoch from now() - t.last_done_at) / 86400.0 /
                (case t.period when 'day' then 1 when 'week' then 7
                               when 'month' then 30 else 365 end / t.times_per_period::numeric))::numeric, 2)
       end as urgency_ratio,
       case when t.last_done_at is not null
            then (current_date - t.last_done_at::date) end as days_since_last
  from tasks t
 where t.is_active;

-- Contribuição semanal por pessoa (resumo de domingo)
create view v_weekly_contribution with (security_invoker = true) as
select o.household_id, o.completed_by as user_id,
       date_trunc('week', o.completed_at)::date as week_start,
       count(*)                                  as tasks_done,
       sum(o.points_awarded)                     as points
  from task_occurrences o
  join tasks t on t.id = o.task_id
 where o.status = 'done' and t.scope <> 'personal'   -- o pessoal nunca entra nas contas do casal
 group by 1, 2, 3;


-- =====================================================================
-- 9. SEGURANÇA POR LINHA (RLS)
-- Regra geral: só membros da casa veem os dados da casa.
-- Exceções privadas: tarefas pessoais, despesas não partilhadas, horas.
-- =====================================================================

alter table profiles             enable row level security;
alter table households           enable row level security;
alter table household_members    enable row level security;
alter table household_invites    enable row level security;
alter table rooms                enable row level security;
alter table appliances           enable row level security;
alter table tasks                enable row level security;
alter table task_rotation        enable row level security;
alter table task_occurrences     enable row level security;
alter table task_swap_requests   enable row level security;
alter table kudos                enable row level security;
alter table storage_locations    enable row level security;
alter table product_categories   enable row level security;
alter table products             enable row level security;
alter table product_packages     enable row level security;
alter table receipts             enable row level security;
alter table receipt_lines        enable row level security;
alter table stock_lots           enable row level security;
alter table stock_movements      enable row level security;
alter table task_consumptions    enable row level security;
alter table shopping_list_items  enable row level security;
alter table meal_suggestions     enable row level security;
alter table expenses             enable row level security;
alter table time_entries         enable row level security;

-- Perfis: o próprio e quem partilha casa
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from household_members a join household_members b using (household_id)
     where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_write on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

create policy households_read   on households for select using (is_member(id));
create policy households_update  on households for update
  using (is_member(id)) with check (is_member(id));
create policy households_delete  on households for delete using (is_admin(id));  -- só admin apaga
create policy members_read on household_members for select using (is_member(household_id));
create policy members_self_update on household_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Cada membro só pode alterar a hora do resumo; o role não (evita subir-se a admin)
revoke update on household_members from anon, authenticated;
grant  update (daily_summary_time) on household_members to authenticated;

-- Tabelas simples da casa
create policy invites_rw     on household_invites   for all using (is_member(household_id)) with check (is_member(household_id));
create policy rooms_rw       on rooms               for all using (is_member(household_id)) with check (is_member(household_id));
create policy appliances_rw  on appliances          for all using (is_member(household_id)) with check (is_member(household_id));
create policy kudos_rw       on kudos               for all using (is_member(household_id)) with check (is_member(household_id));
create policy locations_rw   on storage_locations   for all using (is_member(household_id)) with check (is_member(household_id));
create policy products_rw    on products            for all using (is_member(household_id)) with check (is_member(household_id));
create policy receipts_rw    on receipts            for all using (is_member(household_id)) with check (is_member(household_id));
create policy lots_rw        on stock_lots          for all using (is_member(household_id)) with check (is_member(household_id));
create policy movements_rw   on stock_movements     for all using (is_member(household_id)) with check (is_member(household_id));
create policy shopping_rw    on shopping_list_items for all using (is_member(household_id)) with check (is_member(household_id));
create policy meals_rw       on meal_suggestions    for all using (is_member(household_id)) with check (is_member(household_id));

-- Tabelas-filhas: herdam a visibilidade do pai (a RLS do pai aplica-se dentro do exists)
create policy packages_rw on product_packages for all
  using (exists (select 1 from products p where p.id = product_id))
  with check (exists (select 1 from products p where p.id = product_id));
create policy receipt_lines_rw on receipt_lines for all
  using (exists (select 1 from receipts r where r.id = receipt_id))
  with check (exists (select 1 from receipts r where r.id = receipt_id));

-- Categorias e modelos de referência: só leitura
create policy categories_read on product_categories for select using (true);
alter table product_templates enable row level security;
create policy templates_read on product_templates for select using (true);

-- TAREFAS: as pessoais só são visíveis para o dono
create policy tasks_rw on tasks for all
  using (is_member(household_id) and (scope <> 'personal' or owner_user_id = auth.uid()))
  with check (is_member(household_id) and (scope <> 'personal' or owner_user_id = auth.uid()));
create policy rotation_rw on task_rotation for all
  using (exists (select 1 from tasks t where t.id = task_id))
  with check (exists (select 1 from tasks t where t.id = task_id));
create policy occurrences_rw on task_occurrences for all
  using (exists (select 1 from tasks t where t.id = task_id))
  with check (exists (select 1 from tasks t where t.id = task_id));
create policy consumptions_rw on task_consumptions for all
  using (exists (select 1 from tasks t where t.id = task_id))
  with check (exists (select 1 from tasks t where t.id = task_id));
create policy swaps_rw on task_swap_requests for all
  using (exists (select 1 from task_occurrences o where o.id = occurrence_id))
  with check (exists (select 1 from task_occurrences o where o.id = occurrence_id));

-- DESPESAS: partilhadas visíveis ao casal; as outras só a quem pagou
create policy expenses_rw on expenses for all
  using (is_member(household_id) and (is_shared or paid_by = auth.uid()))
  with check (is_member(household_id) and paid_by = auth.uid());

-- HORAS: sempre privadas
create policy time_rw on time_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- =====================================================================
-- 10. DADOS DE REFERÊNCIA
-- Prazos de validade deixados a NULL de propósito: preencher a partir de
-- uma fonte de segurança alimentar (ex.: USDA FoodKeeper) antes de lançar.
-- =====================================================================

insert into product_categories (id, name, default_location, is_food) values
  (1,  'Carne fresca',               'fridge',   true),
  (2,  'Peixe fresco',               'fridge',   true),
  (3,  'Laticínios',                 'fridge',   true),
  (4,  'Fruta',                      'pantry',   true),
  (5,  'Legumes',                    'fridge',   true),
  (6,  'Congelados',                 'freezer',  true),
  (7,  'Mercearia seca',             'pantry',   true),
  (8,  'Conservas',                  'pantry',   true),
  (9,  'Pão e padaria',              'pantry',   true),
  (10, 'Bebidas',                    'pantry',   true),
  (11, 'Limpeza da casa',            'cleaning', false),
  (12, 'Lavandaria',                 'cleaning', false),
  (13, 'Papel e descartáveis',       'cleaning', false),
  (14, 'Higiene pessoal',            'bathroom', false),
  (15, 'Animais de estimação',       'other',    false);

-- Modelos para o onboarding (estimativas genéricas; o utilizador ajusta)
insert into product_templates
  (id, name, emoji, category_id, base_unit, full_quantity,
   task_title, task_times_per_period, task_period, consumption_per_task) values
  (1, 'Sacos do lixo',          '🗑️', 13, 'un',    30, 'Despejar o lixo',        3, 'week', 1),
  (2, 'Detergente da roupa',    '🧺', 12, 'dose',  40, 'Lavar roupa',            2, 'week', 1),
  (3, 'Pastilhas da loiça',     '🍽️', 11, 'un',    40, 'Pôr a máquina da loiça', 4, 'week', 1),
  (4, 'Areia do gato',          '🐈', 15, 'kg',    10, 'Limpar a areia do gato', 2, 'week', 1),
  (5, 'Sacos da reciclagem',    '♻️', 13, 'un',    20, 'Despejar a reciclagem',  1, 'week', 1),
  (6, 'Papel higiénico',        '🧻', 13, 'rolo',  12, null, null, null, null),
  (7, 'Rolos de cozinha',       '🧻', 13, 'rolo',   6, null, null, null, null),
  (8, 'Detergente da loiça',    '🧴', 11, 'dose', 100, 'Lavar a loiça à mão',    7, 'week', 1);
