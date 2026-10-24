# Provisório do M3

`ensure_today_occurrences(p_household)` cria uma ocorrência para hoje por cada tarefa ativa
da casa (uma vez por dia, sem respeitar a frequência nem atribuir pessoas).
Existe só para o ecrã "Hoje" ter dados antes do M4. No M4 é substituída pela Edge Function
agendada, que gera as ocorrências conforme a periodicidade e atribui (fixed/rotation/balanced/free).
