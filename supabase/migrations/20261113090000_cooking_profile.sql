-- M14: perfil de cozinha da casa (quando comem, quantas pessoas, orçamento, preferências, restrições e equipamentos).
-- É o que a IA das refeições (M9) vai usar. Um por casa; qualquer membro o vê e altera (RLS).
-- As escolhas são chaves fixas (validadas aqui), não texto livre, para a IA nunca receber instruções escondidas;
-- a única nota livre (alergias) é curta e vai sempre à IA como DADOS.
create table cooking_profiles (
  household_id        uuid primary key references households(id) on delete cascade,
  schedule            text not null default 'workweek'
                        check (schedule in ('workweek', 'lunchbox', 'dinners', 'everything')),
  diners              smallint not null default 2 check (diners between 1 and 12),
  weekly_budget_cents integer check (weekly_budget_cents is null or weekly_budget_cents between 0 and 100000),
  cravings            text[] not null default '{}'
                        check (cardinality(cravings) <= 3
                           and cravings <@ array['quick', 'low_calorie', 'comfort', 'healthy', 'homemade_delivery', 'gut_friendly', 'high_protein']),
  cook_style          text not null default 'fresh' check (cook_style in ('batch', 'fresh')),
  equipment           text[] not null default '{}'
                        check (cardinality(equipment) <= 30
                           and equipment <@ array['stove', 'oven', 'microwave', 'air_fryer', 'pressure_cooker', 'slow_cooker',
                                                  'thermomix', 'blender', 'food_processor', 'stand_mixer', 'grill', 'toaster',
                                                  'rice_cooker', 'steamer']),
  restrictions        text[] not null default '{}'
                        check (cardinality(restrictions) <= 12
                           and restrictions <@ array['gluten', 'lactose', 'nuts', 'shellfish', 'eggs', 'fish', 'pork', 'vegetarian', 'vegan']),
  restrictions_note   text check (restrictions_note is null or char_length(restrictions_note) <= 200),
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now()
);

alter table cooking_profiles enable row level security;
create policy cooking_profiles_select on cooking_profiles for select using (is_member(household_id));
create policy cooking_profiles_insert on cooking_profiles for insert
  with check (is_member(household_id) and updated_by = auth.uid());
create policy cooking_profiles_update on cooking_profiles for update
  using (is_member(household_id)) with check (is_member(household_id) and updated_by = auth.uid());
grant select, insert, update on cooking_profiles to authenticated;
