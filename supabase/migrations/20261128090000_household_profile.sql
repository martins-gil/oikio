-- Perfil da casa: tipo de casa, exterior, animais e quantas pessoas vivem lá, por faixa etária.
-- Serve para sugerir as tarefas certas no arranque (e, mais tarde, adaptar as refeições ao agregado).
-- Só guarda CONTAGENS por faixa: nunca nomes nem datas de nascimento (há menores e o RGPD pede o mínimo).
-- As escolhas são chaves fixas validadas aqui. A app só lê a tabela; escreve por save_household_profile().
create table household_profile (
  household_id uuid primary key references households(id) on delete cascade,
  home_type    text not null check (home_type in ('apartment', 'house', 'shared')),
  outdoor      text not null default 'none' check (outdoor in ('none', 'balcony', 'garden')),
  pets         text[] not null default '{}'
                 check (cardinality(pets) <= 3 and pets <@ array['dog', 'cat', 'other']),
  babies       smallint not null default 0 check (babies   between 0 and 10),  -- 0–2 anos
  children     smallint not null default 0 check (children between 0 and 10),  -- 3–12
  teens        smallint not null default 0 check (teens    between 0 and 10),  -- 13–17
  adults       smallint not null default 0 check (adults   between 0 and 20),  -- 18–64
  seniors      smallint not null default 0 check (seniors  between 0 and 10),  -- 65 ou mais
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  check (babies + children + teens + adults + seniors between 1 and 20)
);

alter table household_profile enable row level security;
create policy household_profile_select on household_profile for select using (is_member(household_id));
grant select on household_profile to authenticated;

-- Guarda (cria ou substitui) o perfil. Administradores e adultos da casa; as crianças-membro e quem não é da casa não.
create or replace function save_household_profile(
  p_household uuid, p_home_type text, p_outdoor text, p_pets text[],
  p_babies integer, p_children integer, p_teens integer, p_adults integer, p_seniors integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pets text[];
  v_total integer;
begin
  if auth.uid() is null
     or not exists (select 1 from household_members
                     where household_id = p_household and user_id = auth.uid() and role in ('admin', 'adult')) then
    raise exception 'Só os adultos da casa podem alterar o perfil da casa';
  end if;
  if p_home_type is null or p_home_type not in ('apartment', 'house', 'shared') then
    raise exception 'Escolhe o tipo de casa';
  end if;
  if p_outdoor is null or p_outdoor not in ('none', 'balcony', 'garden') then
    raise exception 'Escolhe o espaço exterior';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_pets from unnest(coalesce(p_pets, '{}')) x;
  if cardinality(v_pets) > 3 or not (v_pets <@ array['dog', 'cat', 'other']) then
    raise exception 'Animais inválidos';
  end if;

  if least(coalesce(p_babies, 0), coalesce(p_children, 0), coalesce(p_teens, 0),
           coalesce(p_adults, 0), coalesce(p_seniors, 0)) < 0 then
    raise exception 'O número de pessoas não pode ser negativo';
  end if;
  v_total := coalesce(p_babies, 0) + coalesce(p_children, 0) + coalesce(p_teens, 0)
           + coalesce(p_adults, 0) + coalesce(p_seniors, 0);
  if v_total < 1 then raise exception 'Tem de viver pelo menos uma pessoa na casa'; end if;
  if v_total > 20 then raise exception 'No máximo 20 pessoas por casa'; end if;

  insert into household_profile (household_id, home_type, outdoor, pets, babies, children, teens, adults, seniors,
                                 updated_by, updated_at)
  values (p_household, p_home_type, p_outdoor, v_pets, coalesce(p_babies, 0), coalesce(p_children, 0),
          coalesce(p_teens, 0), coalesce(p_adults, 0), coalesce(p_seniors, 0), auth.uid(), now())
  on conflict (household_id) do update set
    home_type = excluded.home_type, outdoor = excluded.outdoor, pets = excluded.pets,
    babies = excluded.babies, children = excluded.children, teens = excluded.teens,
    adults = excluded.adults, seniors = excluded.seniors,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end $$;

revoke all on function save_household_profile(uuid, text, text, text[], integer, integer, integer, integer, integer) from public, anon;
grant execute on function save_household_profile(uuid, text, text, text[], integer, integer, integer, integer, integer) to authenticated;
