# Várias casas por conta (M18)

Uma pessoa pode pertencer a várias casas (no máximo 10). A app trabalha sempre com **uma casa ativa**.

## Na app
- **Seletor:** no cabeçalho roxo de cada separador, o nome da casa («🏠 Casa da cidade ▾»). Ao tocar abre «As tuas casas»: escolhes outra, ou «➕ Criar outra casa» / «🔑 Tenho um convite».
- **Casa ativa:** guardada no próprio telemóvel (por pessoa). Ao mudar, os ecrãs recomeçam do zero para nunca mostrarem dados da casa anterior. Criar ou entrar numa casa torna-a a ativa.
- **Casa → «Sair desta casa»** (com confirmação): o histórico fica na casa; o que estava atribuído a ti fica livre (tarefas fixas passam a «equilibradas»). Não podes sair se fores a única pessoa, nem se fores o único administrador: primeiro «Tornar administrador» a outra pessoa (`make_admin()`).
- **Convites:** aceitar um convite já não recusa quem tem outra casa com dados. A única exceção automática é uma conta nova cuja única casa está vazia e é só dela (criada por engano): essa é apagada, como antes.
- **Definições pessoais** (custos, validades, Explica-me) valem em todas as casas.

## Na base de dados
- Tudo já era por casa (RLS por membro); nada se mistura entre casas. Teste: `supabase/tests/multi_household.sql`.
- `leave_household()`, `make_admin()`, `create_household()` (limite de 10) e `accept_invite()` (migração `20261123090000_multi_household.sql`).
- **Lembretes:** juntam todas as casas da pessoa; com mais de uma casa, cada parte leva o nome da casa («Casa da praia: 1 tarefa para hoje»).
- **Funções de IA** (`suggest-meals`, `plan-week`, `explain-spending`) recebem `household_id` e a RLS confirma que a pessoa é membro; sem ele usam a primeira casa.
- As tarefas pessoais e o banco de horas pertencem a uma casa: com várias casas, o separador Pessoal mostra o da casa ativa.
