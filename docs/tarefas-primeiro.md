# Tarefas primeiro (M20)

Origem: avaliação do produto. A gestão da casa (tarefas) é o centro; os produtos são o suporte; refeições e dinheiro são extras. Este marco reorganiza a app em volta disso, em passos pequenos.

## Passos
1. ✅ **Tarefa ↔ produtos no formulário** (este passo). Na ficha da tarefa, «Gasta produtos (opcional)»: juntas produtos (ou crias um só com o nome) com a quantidade; ao marcar a tarefa como feita, o gatilho existente desconta o stock e, abaixo do mínimo, o produto entra na lista de compras. Na ficha do produto, «Usado em» lista as tarefas que o gastam. Base de dados: `set_task_products()` (só administradores e adultos nas tarefas da casa; o dono nas pessoais; máx. 8 produtos; produtos da própria casa).
2. ☐ **«Hoje» primeiro:** o ecrã inicial mostra primeiro o que fazer hoje e esta semana; «Estado da casa» e pontos passam para um bloco compacto.
3. ☐ **Arranque por tarefas:** pacotes de arranque (rotina básica, animais, crianças…) e só depois ligar produtos.
4. ☐ **Formulário de tarefa mais simples:** nome, frequência e quem; o resto em «Mais opções»; sem «Quem faz» numa casa de uma pessoa.
5. ☐ **Produtos mais simples por defeito:** «Tenho / A acabar / Acabou», detalhes em «Mais».

## Testes
`supabase/tests/task_products.sql` (16 verificações, incluindo o desconto ao marcar como feita).
