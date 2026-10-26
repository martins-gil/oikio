# Tarefas primeiro (M20)

Origem: avaliação do produto. A gestão da casa (tarefas) é o centro; os produtos são o suporte; refeições e dinheiro são extras. Este marco reorganiza a app em volta disso, em passos pequenos.

## Passos
1. ✅ **Tarefa ↔ produtos no formulário** (este passo). Na ficha da tarefa, «Gasta produtos (opcional)»: juntas produtos (ou crias um só com o nome) com a quantidade; ao marcar a tarefa como feita, o gatilho existente desconta o stock e, abaixo do mínimo, o produto entra na lista de compras. Na ficha do produto, «Usado em» lista as tarefas que o gastam. Base de dados: `set_task_products()` (só administradores e adultos nas tarefas da casa; o dono nas pessoais; máx. 8 produtos; produtos da própria casa).
2. ✅ **«Hoje» primeiro:** o separador chama-se «Hoje». A ordem passou a ser: saudação e progresso, pedidos de troca e agradecimentos, **📋 Por fazer** (as tarefas), atalhos (Nova tarefa, Sugestões, Refeições, Agendadas), «🚦 Estado da casa», resumo da semana e feitas.
3. ✅ **Arranque por tarefas** (`app/starter.tsx`): «O que fazem em casa?» com temas (rotina básica, roupa, limpeza regular, animais, plantas, manutenção; `PACKS` em `lib/taskSuggestions.ts`) → confirmas a lista → criadas por `save_task()`. É o primeiro passo depois de criar a casa (e o botão «Começar com tarefas» do ecrã vazio). Os produtos vêm depois, e a dica explica «Gasta produtos».
4. ✅ **Formulário de tarefa mais simples:** nome, **frequência rápida** (todos os dias, todas as semanas, todos os meses, quando for preciso), «Quem faz» (só se a casa tem 2 ou mais pessoas) e «Gasta produtos». Uma tarefa nova começa «todas as semanas». Em «▼ Mais opções»: frequência detalhada (dias da semana, de N em N dias, mensal, anual, uma vez), dia de início, esforço e «Alternar»/«Qualquer um». Ao editar uma tarefa que já usa opções avançadas, estas abrem-se sozinhas.
5. ☐ **Produtos mais simples por defeito:** «Tenho / A acabar / Acabou», detalhes em «Mais».

## Testes
`supabase/tests/task_products.sql` (16 verificações, incluindo o desconto ao marcar como feita).

## Barra da semana e previsão (adicionado ao passo 2)
- O ecrã «Hoje» abre sempre **em hoje**. A barra da semana, logo por baixo da saudação, deixa tocar noutro dia desta semana: dias passados mostram o que ficou por fazer e o que foi feito; dias futuros mostram as tarefas já marcadas e as **previstas** (um número por baixo do dia). «Voltar a hoje» regressa.
- A geração cria cada ocorrência só no próprio dia, por isso a previsão vem de `week_forecast(casa, de, até)`, que simula as mesmas regras (calendário, X por período, de N em N dias) **sem criar nada**. São previsões: o dia real pode mudar conforme se fazem as anteriores. Tarefas pessoais e «quando for preciso» não entram. Teste: `supabase/tests/week_forecast.sql`.
