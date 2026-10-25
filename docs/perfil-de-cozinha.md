# Perfil de cozinha (M14)

Um perfil por casa (`cooking_profiles`), preenchido num assistente de 7 passos (⚙️ → «Perfil de cozinha», ou no fundo de Produtos):
quando comem, quantas pessoas, orçamento semanal, o que apetece (até 3), como gostam de cozinhar, equipamentos e alergias/restrições.

- As escolhas são **chaves fixas** validadas na base de dados (`lib/kitchen.ts` tem os textos). A única nota livre (outras alergias)
  tem no máximo 200 caracteres e é enviada à IA como DADOS, nunca como instruções.
- Qualquer membro da casa vê e altera o perfil (RLS); outra casa não vê nada (`supabase/tests/cooking_profile.sql`).
- O orçamento semanal pode vir do orçamento mensal de Supermercado do Dinheiro (mensal × 12 ÷ 52).
- O M9 (refeições) lê este perfil: pessoas, equipamento, orçamento, preferências e, sobretudo, as restrições.
- Os ícones dos equipamentos são gerados por `design/equipment.mjs`.
