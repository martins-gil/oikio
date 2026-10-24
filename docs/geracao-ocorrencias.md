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

## "Feito" antes da altura e escolher a próxima data
- `complete_task_now(tarefa)`: marca como feita agora. Se há uma ocorrência pendente (atrasada ou agendada), é essa;
  senão cria uma de hoje já feita. Numa tarefa com calendário, essa ocorrência cobre a PRÓXIMA data do calendário
  (`scheduled_for`), que por isso é saltada: mensal no dia 8, feita a 3 → salta o dia 8, a seguinte é a de 8 do mês seguinte.
  Nas restantes conta para o período / recomeça a contagem. Duas vezes no mesmo dia é recusado.
- `set_next_date(tarefa, data)`: move a ocorrência pendente para a data escolhida; se não há, cria a próxima nessa data
  (cobrindo a data do calendário, para não duplicar). Administradores e adultos em qualquer tarefa; quem tem a tarefa na sua;
  o dono nas pessoais. De hoje até daqui a um ano, nunca em dia que já tenha uma desta tarefa.
- `next_free_slot()` / `task_next_date()`: a próxima data do calendário que ainda não está coberta por nenhuma ocorrência.

## Dia de início
- Ao criar (ou editar) uma tarefa escolhe-se o dia em que começa (`p_start_date` → `tasks.schedule_start`), com um calendário.
  Sem escolha, começa hoje. Não há ocorrências antes desse dia, seja qual for a frequência.
- Tarefas com calendário: é o dia a partir do qual o calendário conta (e a âncora das de 2 em 2 semanas).
- X por período e de N em N dias: é o primeiro dia em que a tarefa aparece.
- "Quando for preciso": se se escolher um dia, fica uma ocorrência agendada nesse dia (senão não gera nada).
- "Uma vez": continua a usar o seu dia (`p_first_date`).
- Editar: com um dia novo, muda o início; sem o tocar, mantém-no (e recomeça hoje se o calendário mudar).

