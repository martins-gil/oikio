# Geração de ocorrências (M4)

Implementada em SQL (`generate_occurrences`), agendada com `pg_cron` de hora a hora e
chamada também pela app ao abrir o ecrã "Hoje". Decisão: SQL em vez de Edge Function
(sem Deno/Docker, sem service role, testável em Postgres local). As Edge Functions ficam
para notificações (M7) e IA (M8/M9).

## Quando aparece uma tarefa
- `times_per_period`: até N por período (semana de segunda a domingo, mês, ano), com intervalo
  mínimo de dias-do-período ÷ N. 2×/semana → segunda e quinta. Máximo uma por dia.
- `interval_since_last`: quando passaram N dias desde a última vez feita.
- `once`: uma só vez.
- `no_frequency` e `fixed_schedule` (RRULE): não geram nada por agora.
- Se a tarefa já tem uma ocorrência pendente, não gera outra: a pendente fica "em atraso".

## Quem faz
- `balanced`: quem tem menos esforço (feito nos últimos 14 dias + pendente); empate → quem entrou primeiro.
- `fixed`: `fixed_assignee` (ou o dono). `rotation`: o seguinte em `task_rotation`. `free`: sem dono.
- Membros `child` não recebem tarefas automáticas. Tarefas pessoais nunca são geradas aqui.

## Pontos em aberto
- Saltar uma tarefa (estado `skipped`) ainda não tem botão na app.
- `fixed_schedule` precisa de interpretar RRULE (provavelmente numa Edge Function).
