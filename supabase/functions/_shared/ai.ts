// Modelo de IA usado pelas funções do NestKeep, numa só constante (os modelos são descontinuados com o tempo).
// Para gastar menos, troca por 'claude-sonnet-5-5' (cerca de metade do preço) ou 'claude-haiku-5-5' (muito mais barato,
// mas lê talões com menos cuidado). Depois: npx supabase functions deploy read-receipt
export const AI_MODEL = 'claude-opus-5-5';

// Sugestões de refeições (M9): mais barato que o dos talões, porque escreve texto em vez de ler imagens.
// Depois de mudar: npx supabase functions deploy suggest-meals
export const AI_MODEL_MEALS = 'claude-sonnet-5-5';
