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
