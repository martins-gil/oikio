# Termos e Política de Privacidade: notas para quem os revê

Os textos estão em `lib/legal.ts` (ecrãs `app/terms.tsx` e `app/privacy.tsx`) e foram escritos a partir do que a app faz hoje.
**São um rascunho: não substituem a revisão de um advogado.** Se a app mudar (novos dados, novos fornecedores), mudar os textos.

## O que ainda tem de ser preenchido
- `LEGAL.controller` (nome ou empresa responsável pelo tratamento) e `LEGAL.contactEmail`: hoje aparecem como «[… por definir]» na app.
  Convém um e-mail do domínio da app (ver `docs/email-proprio.md`).
- `LEGAL.updated`: atualizar a data sempre que os textos mudarem.

## Lacunas da app que a Política já assume
1. **Apagar a conta já existe** (Casa → «Apagar a minha conta», função `delete_my_account()`, 21 testes). Efeitos: casas com uma só pessoa apagam-se;
   nas outras a administração passa a quem entrou primeiro e o que a pessoa registou fica sem o nome; apagam-se as tarefas pessoais, o banco de horas,
   as definições, os lembretes, os agradecimentos e trocas e **as despesas que pagou** (a ligação à pessoa é obrigatória nessa tabela; avaliar se as despesas
   partilhadas deviam ficar anónimas). **Fotos de talões** que tenham ficado no armazenamento (leitura falhada) não são apagadas pela função: confirmar.
2. **Retenção:** a Política diz «até 90 dias» nas cópias de segurança (o mesmo prazo que o Homsy indica). É um máximo seguro: segundo a documentação do
   Supabase as cópias diárias guardam-se 7 dias no plano Pro, 14 no Team e até 30 no Enterprise (no plano gratuito, confirmar no painel). Se se mudar de plano,
   rever. Mantém-se também o que a lei obrigue a guardar.
3. **Contratos com subcontratantes (RGPD art. 28.º):** convém confirmar e guardar os acordos de tratamento de dados com Supabase, Anthropic, Resend,
   Expo e Google (Firebase). Confirmar também onde cada um trata os dados, e as garantias das transferências para fora da UE (cláusulas-tipo).
4. **Dados de saúde (alergias):** a nota de alergia livre e as restrições são dados de categoria especial (art. 9.º). Está previsto o consentimento
   explícito ao escrevê-las (aviso no Perfil de cozinha). Confirmar se basta ou se é preciso um consentimento registado.
5. **Menores:** a app guarda só contagens de crianças por faixa etária. Confirmar que isto não traz obrigações adicionais.
6. **Inteligência artificial:** confirmar com os termos atuais da Anthropic o tratamento e a retenção dos dados enviados pela API (fotos de talões,
   stock, perfil de cozinha). A Política afirma que não enviamos nome nem e-mail (verificado no código das quatro funções).
7. **Aceitação:** os ecrãs mostram «Ao continuar, aceitas…» com ligações (criar casa, entrar, proteger a conta, Casa). Não há caixa de seleção nem
   registo da versão aceite. Decidir se é preciso guardar a data e a versão da aceitação.
8. **Direito do consumidor:** confirmar a cláusula de responsabilidade (o que a lei não permite excluir), a menção às entidades de resolução de
   litígios e se é preciso Livro de Reclamações eletrónico (depende de quem é o responsável: particular ou empresa).
9. **Alimentação de bebés e crianças:** o texto avisa que não é um guia. As regras da app vêm de fontes que ainda têm de ser confirmadas (ver
   `docs/refeicoes.md`, «Fontes e o que NÃO está confirmado»).

## Antes de publicar nas lojas
Texto revisto e preenchido; endereço público dos documentos (as lojas pedem um URL da Política de Privacidade, além da versão na app);
botão de apagar conta; formulários de privacidade da App Store («Privacy Nutrition Label») e do Google Play («Data safety»), que têm de coincidir com
a lista de dados do ponto 2 da Política.

## Comparação com os textos do Homsy (lidos nas capturas de ecrã, só para ver o que cobrir; nada foi copiado)
- **Linguagem.** O Homsy usa inglês jurídico norte-americano («indemnify, defend and hold harmless», «as is», «sole discretion», sem aviso e sem responsabilidade).
  O nosso texto é PT-PT simples, em «tu», com um «Em resumo» no início de cada documento. Não adotámos três cláusulas deles que, na lei portuguesa e europeia
  de consumo, podem ser abusivas: a indemnização geral do utilizador, a rescisão «a qualquer momento e por qualquer razão, sem aviso» e a exclusão total de garantias.
- **O que adotámos como ideia (escrito de novo):** propriedade intelectual e licença limitada; serviços de terceiros; disposições gerais (nulidade parcial);
  divulgação a autoridades por obrigação legal; câmara e fotos explicadas em separado; «sem cookies nem análise»; apagar a conta dentro da app e o que acontece às casas
  (a secção sobre apagar conta deles foi a inspiração para o nosso ponto 9); retenção em cópias de segurança.
- **O que não se aplica a nós e por isso não consta:** Google Calendar, Stripe e subscrições pagas, Google Analytics e eventos de utilização, Open Food Facts
  e leitura de códigos de barras, camada «Pro».
- **Onde ainda ficamos atrás:** não definimos o prazo das cópias de segurança (ponto 2), nem há página pública (URL) para a Política, que as lojas pedem.
