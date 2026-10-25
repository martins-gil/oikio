-- Sugestões de produtos por local (o que acaba sempre no frigorífico, no congelador, na despensa…).
-- Cada modelo passa a poder dizer em que local fica; sem isso vale o local por defeito da categoria.
alter table product_templates add column location location_kind;

-- Quantidades "cheio" = uma compra típica de uma casa pequena, editáveis depois (embalagens = 'un').
insert into product_templates (id, name, emoji, category_id, base_unit, full_quantity, location) values
  -- Frigorífico
  (9,  'Leite',               '🥛', 3,  'un', 6,  'fridge'),
  (10, 'Ovos',                '🥚', 3,  'un', 12, 'fridge'),
  (11, 'Iogurtes',            '🥣', 3,  'un', 8,  'fridge'),
  (12, 'Queijo',              '🧀', 3,  'un', 2,  'fridge'),
  (13, 'Manteiga',            '🧈', 3,  'un', 2,  'fridge'),
  (14, 'Fiambre',             '🥓', 1,  'un', 2,  'fridge'),
  (15, 'Natas de cozinha',    '🍶', 3,  'un', 3,  'fridge'),
  (16, 'Legumes frescos',     '🥬', 5,  'un', 6,  'fridge'),
  (17, 'Carne fresca',        '🥩', 1,  'un', 4,  'fridge'),
  (18, 'Peixe fresco',        '🐟', 2,  'un', 3,  'fridge'),
  -- Congelador
  (19, 'Legumes congelados',  '🥦', 6,  'un', 4,  'freezer'),
  (20, 'Peixe congelado',     '🐟', 6,  'un', 4,  'freezer'),
  (21, 'Carne congelada',     '🍗', 6,  'un', 4,  'freezer'),
  (22, 'Pão congelado',       '🍞', 9,  'un', 2,  'freezer'),
  (23, 'Gelados',             '🍦', 6,  'un', 2,  'freezer'),
  (24, 'Pizzas congeladas',   '🍕', 6,  'un', 3,  'freezer'),
  -- Despensa
  (25, 'Arroz',               '🍚', 7,  'un', 4,  'pantry'),
  (26, 'Massa',               '🍝', 7,  'un', 6,  'pantry'),
  (27, 'Azeite',              '🫒', 7,  'un', 3,  'pantry'),
  (28, 'Açúcar',              '🍬', 7,  'un', 2,  'pantry'),
  (29, 'Farinha',             '🌾', 7,  'un', 2,  'pantry'),
  (30, 'Café',                '☕', 7,  'un', 3,  'pantry'),
  (31, 'Cereais',             '🌽', 7,  'un', 2,  'pantry'),
  (32, 'Atum em lata',        '🥫', 8,  'un', 8,  'pantry'),
  (33, 'Feijão e grão',       '🫘', 8,  'un', 6,  'pantry'),
  (34, 'Molho de tomate',     '🍅', 8,  'un', 4,  'pantry'),
  (35, 'Pão',                 '🥖', 9,  'un', 2,  'pantry'),
  (36, 'Água',                '💧', 10, 'un', 6,  'pantry'),
  (37, 'Fruta',               '🍎', 4,  'un', 10, 'pantry'),
  (38, 'Batatas',             '🥔', 5,  'un', 5,  'pantry'),
  (39, 'Cebolas e alhos',     '🧅', 5,  'un', 4,  'pantry'),
  -- Limpeza
  (40, 'Amaciador',           '🧺', 12, 'dose', 40, 'cleaning'),
  (41, 'Lixívia',             '🧴', 11, 'un', 2,  'cleaning'),
  (42, 'Limpa-vidros',        '🪟', 11, 'un', 2,  'cleaning'),
  (43, 'Desengordurante',     '🧴', 11, 'un', 2,  'cleaning'),
  (44, 'Esponjas e panos',    '🧽', 11, 'un', 6,  'cleaning'),
  -- Outros
  (45, 'Pilhas',              '🔋', null, 'un', 8, 'other'),
  (46, 'Lâmpadas',            '💡', null, 'un', 4, 'other'),
  (47, 'Champô',              '🧴', 14, 'un', 2,  'other'),
  (48, 'Pasta de dentes',     '🪥', 14, 'un', 3,  'other'),
  (49, 'Gel de banho',        '🚿', 14, 'un', 2,  'other'),
  (50, 'Desodorizante',       '🧴', 14, 'un', 2,  'other');

-- Criar o produto a partir de um modelo agora também guarda o local do modelo
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
                        tracking_mode, full_quantity, min_stock, location)
  values (p_household, v_t.name, v_t.category_id, v_t.base_unit,
          'level', v_t.full_quantity, round(v_t.full_quantity * 0.25, 2), v_t.location)
  returning id into v_product;

  if v_t.task_title is not null then
    -- Reaproveita a tarefa se já existir (ex.: dois produtos gastos em "Lavar roupa")
    select id into v_task from tasks
     where household_id = p_household and title = v_t.task_title and scope = 'home'
       and deleted_at is null
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
