# Perfil da casa

Base do arranque por perguntas: o que se sabe da casa decide que tarefas se sugerem
(e, mais tarde, como se adaptam as refeições ao agregado).

## O que se guarda (`household_profile`, uma linha por casa)
- `home_type`: `apartment`, `house` ou `shared` (casa partilhada).
- `outdoor`: `none`, `balcony` ou `garden`.
- `pets`: `dog`, `cat`, `other` (até 3, sem repetidos).
- Pessoas por faixa etária, **só contagens**: `babies` (0–2 anos), `children` (3–12), `teens` (13–17),
  `adults` (18–64), `seniors` (65 ou mais). Total entre 1 e 20.

## Privacidade
- Nunca nomes nem datas de nascimento de menores: só quantas pessoas há em cada faixa (RGPD, o mínimo necessário).
- RLS: qualquer membro da casa lê; mais ninguém.
- A app não escreve na tabela: usa `save_household_profile()` (cria ou substitui). Só administradores e adultos da casa
  a podem chamar; um membro `child` ou quem não é da casa é recusado. Fica registado `updated_by`.
- Valores fora das listas fixas, total fora de 1–20 ou números negativos são recusados na base de dados.

## Como se usa
- O arranque (`app/starter.tsx`) pergunta tipo de casa, exterior, animais e pessoas, e propõe as tarefas conforme o perfil.
- Quem já tem casa pode preencher o perfil depois e receber sugestões novas, sem mexer nas tarefas existentes.
- Um passo seguinte, à parte, fará as refeições (`suggest-meals`, `plan-week`) usarem o agregado.

Testes: `supabase/tests/household_profile.sql`.

## Tarefas sugeridas por perfil (`lib/taskSuggestions.ts`)
- Cada **tema** (`PACKS`) tem `visible(perfil)` e `preselected(perfil)`: «Bebé», «Crianças», «Adolescentes», «Seniores», «Animais» e
  «Jardim» só aparecem se o perfil o pedir; «Rotina básica» e «Roupa» vêm sempre marcados; «Manutenção» vem marcada em moradia;
  «Plantas e reciclagem» vem marcada se há varanda ou jardim. Dentro de um tema, cada tarefa pode ter uma condição (`when`),
  por exemplo «Passear o cão» só com cão.
- `tune()` ajusta a frequência e dá o **motivo** que se vê na lista («Com um bebé lava-se mais roupa», «Para 4 pessoas»).
  Exemplos: «Lavar roupa» = metade das pessoas, +1 com bebé, +1 com crianças (entre 2 e 6 por semana); «Pôr a máquina da loiça»
  3/4/5 por semana conforme as pessoas; aspirar 3× com animais ou crianças pequenas; lençóis todas as semanas com bebé.
- Os valores são **estimativas minhas**, não fonte oficial: a pessoa tira o visto ou muda a frequência em cada tarefa.
  Os lembretes de saúde («caixa dos comprimidos», «receitas e consultas») são só lembretes simples, sem indicações médicas.
- `staggerStart()` espalha o dia de início das tarefas «X por semana» pelos 7 dias seguintes (as mais pesadas primeiro, no dia mais
  leve), para «Hoje» não ficar com tudo no primeiro dia. Usa `p_start_date` de `save_task`; não mexe na geração de ocorrências
  nem no modo «Equilibrada».

## Só o essencial no arranque
- No arranque só se criam as tarefas **essenciais** dos temas que a app marcou (lista `LATER` em `lib/taskSuggestions.ts` com as que ficam
  para depois: passar a ferro, toalhas, lençóis, brinquedos, manutenção anual…). Se a pessoa marcar um tema por si (por exemplo «Limpeza regular»),
  vê todas as tarefas desse tema.
- As que ficaram para depois aparecem **já marcadas** no ecrã «💡 Sugestões» (a partir de «Hoje» ou «Estado da casa»), em «Para a vossa casa»,
  com o motivo de cada uma e a frequência ajustada ao agregado. Basta confirmar; começam em dias espalhados (`staggerStart`).
- Exemplo (moradia com jardim, 2 adultos, 1 bebé, 1 criança e gato): 15 essenciais no arranque e 11 ficam para as Sugestões.

## O assistente completo (`app/starter.tsx`)
Passos, com barra «Passo X de 6» (5 se não há convite): **A casa** → **Quem vive em casa** → **Tarefas** (temas, confirmação e ligação a
produtos) → **O que mais querem acompanhar?** (módulos Refeições, Dinheiro e Pessoal, definição pessoal de cada um; grava todos de uma vez
com `setModules`) → **Querem lembretes?** (sim/não; se sim, guarda as preferências e pede a permissão do telemóvel; se a permissão falhar,
a escolha fica guardada e aparece o aviso de como ativar mais tarde) → **Convidem quem vive convosco** (código de `get_or_create_invite`
e botão partilhar; só para o administrador e se vive mais alguém em casa).
Também se abre a partir de Casa → «Perfil da casa e tarefas sugeridas», e mostra o que já estava respondido.

## Refeições (M22b)
As refeições passaram a usar o agregado: porções por idade e regras de segurança para bebés e crianças, aplicadas no servidor.
Ver `docs/refeicoes.md` (inclui as fontes e o que ainda falta confirmar com a DGS).
