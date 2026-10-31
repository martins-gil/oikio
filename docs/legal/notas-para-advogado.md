# Termos e Política de Privacidade: notas para quem os revê

Os textos estão em `lib/legal.ts` (ecrãs `app/terms.tsx` e `app/privacy.tsx`) e foram escritos a partir do que a app faz hoje.
**São um rascunho: não substituem a revisão de um advogado.** Se a app mudar (novos dados, novos fornecedores), mudar os textos.

## O que ainda tem de ser preenchido
- `LEGAL.controller` (nome ou empresa responsável pelo tratamento) e `LEGAL.contactEmail`: hoje aparecem como «[… por definir]» na app.
  Convém um e-mail do domínio da app (ver `docs/email-proprio.md`).
- `LEGAL.updated`: atualizar a data sempre que os textos mudarem.

## Lacunas da app que a Política já assume
1. **Não existe «Apagar a minha conta» dentro da app.** A Política diz que, para já, o pedido faz-se por e-mail. A App Store (e o Google Play) exigem
   apagar a conta dentro da app, quando a app permite criar contas. Tem de ser feito antes de publicar (função na base de dados que apaga a casa se
   for o último membro, anonimiza o resto e apaga o utilizador; mais um botão em Casa).
2. **Retenção:** não está definido o prazo das cópias de segurança do Supabase nem o que acontece ao histórico de tarefas feito por quem apaga a conta
   numa casa partilhada. A Política só diz «apagamos ou tornamos anónimos».
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
