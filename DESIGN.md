# DESIGN.md — NestKeep (App da Casa)

Guia de design da app. Lê este ficheiro antes de criar ou alterar qualquer ecrã,
componente ou estilo. Complementa o CLAUDE.md; se algo contradisser o CLAUDE.md,
pergunta antes de avançar.

## 1. Contexto de uso
App para um casal gerir a casa: tarefas domésticas recorrentes, stock de
consumíveis e alimentos, lista de compras, e um separador pessoal privado.
É usada em segundos, muitas vezes de pé, a meio de outra tarefa, por pessoas
cansadas ou atarefadas. Regra de ouro: registar algo na app tem de ser mais
rápido do que lembrar de cabeça (máximo 2 toques nas ações diárias).
Público principal: mulheres. A app é para uso do casal, e mais tarde será
comercializada (mercado português primeiro).

## 2. Personalidade visual
Elegante, acolhedora, serena, feminina sem ser infantil. Pensa em papelaria
fina ou num diário bem desenhado: muito espaço em branco, poucos elementos por
ecrã, detalhes delicados. Não deve parecer um painel de controlo corporativo.

## 3. Marca (já existe: não substituir)
- Nome: NestKeep ("Your home in flow.").
- Cores (em lib/theme.ts): roxo #5C4DB1 (base), amarelo #FFBF67 e rosa #DC4F89
  (acentos e estados), lavanda #DFDEFF, fundo #F6F5FF, texto #1F1B4D,
  texto secundário #6F6AA0.
- Urgência: verde → amarelo → rosa (em atraso).
- Letras: Montserrat (a fonte do logo) em títulos e botões; Ubuntu no texto
  corrente. Ficheiros em assets/fonts/.
- Usar sempre Text/TextInput de components/Text (nunca os do React Native).
- Estrutura: cada separador usa components/Screen (cabeçalho roxo + folha
  branca arredondada); a barra de baixo é components/TabBar.

## 4. Legibilidade (prioridade máxima)
Tamanhos mínimos, nunca abaixo:
- Texto corrente e itens de lista: 17
- Texto escrito nos campos de formulário: 18
- Etiquetas dos campos e texto secundário: 15 (nunca 12 a 14)
- Botões: 17, Montserrat SemiBold
- Títulos de ecrã: 28; títulos de secção: 21

Outras regras:
- Altura de linha 1.5 no corpo e 1.25 nos títulos.
- Contraste mínimo 4.5:1 (7:1 para o texto principal). O texto secundário
  nunca fica mais claro do que a cor "muted" do tema.
- Os ecrãs têm de aguentar a letra do sistema a 130% sem cortar texto: nada de
  alturas fixas em contentores com texto; deixar botões e chips crescerem.
- Montserrat é uma fonte larga: prever menos caracteres por linha e evitar
  reticências em etiquetas importantes. Evitar maiúsculas em texto longo.
- Números de quantidades e datas com algarismos de largura fixa (tabular).

## 5. Formulários e painéis de preenchimento
- Um campo por linha, largura total, altura mínima 56.
- Etiqueta sempre visível acima do campo (não só placeholder).
- Folhas (bottom sheets) até 90% do ecrã, com o botão principal fixo em baixo,
  ao alcance do polegar.
- Máximo 3 a 4 campos visíveis de cada vez; o resto em "Mais opções".
- Nenhum campo obrigatório além do nome.
- Quantidades: botões − e + de pelo menos 48, além de se poder escrever.
- Seletores grandes (datas, quantidades) em vez de escrita, sempre que possível.

## 6. Elegância e forma
- Cantos generosos: cartões 20, botões e chips bem arredondados, folhas 28.
- Sombras suaves e difusas (tom roxo, opacidade baixa) ou apenas bordas finas.
- Espaço generoso: margens de ecrã 20, espaço entre cartões 16.
- Poucas cores por ecrã: roxo como base; rosa e amarelo só como acento e para
  estados (urgência, favoritos, avisos).
- Ícones de linha, todos do mesmo conjunto e do mesmo traço.
- Detalhes delicados com moderação (divisores finos, fundos subtis). Sem
  gradientes fortes nem ilustrações carregadas.

## 7. Navegação e hierarquia
- Uma pergunta por ecrã: "O que tenho de fazer hoje?", "O que está a acabar?".
- O ecrã "Hoje" mostra primeiro o que exige ação (tarefas por fazer); o resto
  fica a um toque.
- Uma ação principal por ecrã, bem visível. O botão secundário tem de se
  distinguir claramente do primário (contorno ou fundo lavanda com texto roxo).
- Estado comunicado por cor + ícone + texto (nunca só cor).
- Mostrar quem é responsável (iniciais ou avatar).
- Estados vazios amigáveis, com uma ação sugerida.
- Interface em português de Portugal ("ecrã", "utilizador", "telemóvel",
  "registar"). Mensagens de erro simples, sem texto técnico.

## 8. Componentes base
Usar e melhorar os que existem em components/ (Button, Text, Screen, TabBar,
ActionSheet, DatePicker, DateSheet, Toast, ProgressRing, ExpiryCard...). Antes
de criar um componente novo, ver se um existente serve. Componentes novos usam
as variantes de tipografia e os valores do tema.

Componentes partilhados do redesenho (usar em vez de repetir código):
- `Text` com `variant` (`display` 40, `title` 28, `section` 21, `body` 17,
  `input` 18, `label` 15, `button` 17): nunca escrever fontSize nos ecrãs.
  Sem `variant`, o texto fica em 17 e nunca abaixo de 15 (campos de escrita: 18).
- `AuthScreen`, `Field`, `ErrorText` (components/AuthScreen): ecrãs de entrada e
  de conta, com logótipo, etiqueta sempre visível por cima do campo e erros com ⚠.
- `CheckCircle`: visto redondo de 32 nas listas de escolha (cor + sinal ✓).
- `FavoriteStar`: estrela das favoritas com alvo de 48.
- Cabeçalho do sistema (Stack): título na variante `section` (21).

Padrões de ecrã adotados:
- Botão principal fixo no rodapé (formulários, talão, ficha do produto,
  refeições e plano, arranque), fora do scroll e acima da barra do sistema.
- Informação extra em secções que abrem e fecham (Resumo da semana, Feitas,
  detalhes do talão) ou em «Mais opções».
- O assistente do perfil de cozinha mantém-se em passos (uma pergunta por
  ecrã) em vez de cartões numa só página.
- Estados vazios com uma ação sugerida; avisos com cor + ícone + texto.

## 9. Evitar
Texto abaixo de 15, tabelas densas, menus escondidos, ecrãs cheios de métricas,
mais de 3 cores de acento no mesmo ecrã, ícones inconsistentes, gradientes
fortes, sombras pesadas, alvos de toque abaixo de 44.

## 10. Regras de código
- Nunca escrever fontSize, fontFamily ou cores diretamente nos ecrãs. Usar as
  variantes de Text e os valores de lib/theme.ts (cores, escala de tipos,
  espaçamentos, raios, sombras).
- Se faltar um valor no tema, acrescentar ao tema, não ao ecrã.
- Não instalar dependências sem explicar porquê e pedir confirmação.

## 11. Como trabalhar o design (para o Claude Code)
1. Antes de alterações grandes, apresentar um plano em linguagem simples e
   esperar pela aprovação.
2. Um ecrã de cada vez, começando pelos de preenchimento: formulário da tarefa
   (app/task/edit.tsx), ficha do produto (app/product/[id].tsx), talão
   (app/receipt.tsx) e só depois o ecrã "Hoje".
3. No fim de cada ecrã: correr a app, tirar screenshots, critica-los contra
   este ficheiro (tamanhos mínimos, contraste, alvos de toque, hierarquia,
   letra do sistema a 130%) e corrigir o que falhar.
4. Dizer como testar no telemóvel (Expo Go) e propor a mensagem de commit.
