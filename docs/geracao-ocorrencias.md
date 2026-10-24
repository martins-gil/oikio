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
- `fixed_schedule` (calendário): dias da semana (de 1 em 1 ou 2 em 2 semanas), todos os meses no dia N (ou no último)
  e todos os anos em dia/mês. Subconjunto de RRULE validado na base de dados (`rrule_is_valid`):
  `FREQ=WEEKLY;BYDAY=TU,FR[;INTERVAL=2]`, `FREQ=MONTHLY;BYMONTHDAY=8|-1`, `FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15`.
  Se o agendador falhar, recupera até 2 dias para trás. `scheduled_for` guarda a data do calendário, por isso
  mudar o dia de uma ocorrência não a faz reaparecer na data original.
- `no_frequency`: não gera nada (só "feito agora" e "feito há N dias").
- Gerir tarefas: `save_task()` (só admin/adulto na casa; cada pessoa nas suas pessoais), `set_task_active()` (pausar),
  `delete_task()` / `restore_task()` (apagar **não remove**: guarda `deleted_at`/`deleted_by` e o histórico),
  `skip_occurrence()` (saltar, fica "não feita") e `reschedule_occurrence()` (mudar o dia de uma tarefa minha).
  A app já não altera `tasks` diretamente (só `last_done_at`).
- Se a tarefa já tem uma ocorrência pendente, não gera outra: a pendente fica "em atraso".

## Quem faz
- `balanced`: quem tem menos esforço (feito nos últimos 14 dias + pendente); empate → quem entrou primeiro.
- `fixed`: `fixed_assignee` (ou o dono). `rotation`: o seguinte em `task_rotation`. `free`: sem dono.
- Membros `child` não recebem tarefas automáticas.
- Tarefas pessoais (`scope = 'personal'`) geram só para o dono. O esforço delas **não conta** no equilíbrio das
  partilhadas (senão alterava quem recebe o quê e revelava que existem). A RLS esconde-as de todos os outros;
  `supabase/tests/personal_privacy.sql` prova-o.

## Pontos em aberto
- Saltar uma tarefa (estado `skipped`) ainda não tem botão na app.
- `fixed_schedule` precisa de interpretar RRULE (provavelmente numa Edge Function).
