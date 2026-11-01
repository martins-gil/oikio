// Dicas «Sabias que…» do Resumo. REGRA: só entra uma dica com fonte fiável (ver docs/dicas.md).
// Cada dica diz de onde vem (`source`). Nada de promessas de saúde, dieta ou «truques» sem fonte.
import type { ProductIconKey } from './productIconAssets';

export type TipCategory = 'food' | 'cleaning' | 'laundry' | 'safety' | 'pets';
export type Tip = {
  id: string;
  category: TipCategory;
  title: string;
  text: string;
  source: string; // quem o diz (organização)
  icon: ProductIconKey; // desenho já existente em design/products.mjs
  when?: 'pets'; // só para casas com cão ou gato
};

export const TIP_CATEGORY_LABEL: Record<TipCategory, string> = {
  food: 'Alimentos',
  cleaning: 'Limpeza',
  laundry: 'Roupa',
  safety: 'Segurança',
  pets: 'Animais',
};

// A ordem aqui é a ordem em que as dicas rodam (alternando temas de propósito)
export const TIPS: Tip[] = [
  { id: 'food-2h', category: 'food', icon: 'g_fridge', source: 'OMS (5 chaves para alimentos mais seguros)',
    title: 'Não deixes a comida cozinhada ao ar',
    text: 'Comida cozinhada não deve ficar mais de 2 horas à temperatura ambiente. Guarda-a no frigorífico, em recipientes pouco fundos para arrefecer depressa.' },
  { id: 'safety-smoke-test', category: 'safety', icon: 'battery', source: 'Bombeiros (NSW Fire & Rescue)',
    title: 'Testa o detetor de fumo todos os meses',
    text: 'Prime o botão de teste durante pelo menos 5 segundos. Se não apitar, muda a pilha ou o aparelho.' },
  { id: 'cleaning-bleach', category: 'cleaning', icon: 'bleach', source: 'Health Canada e CDC',
    title: 'Nunca juntes lixívia a outros produtos',
    text: 'Lixívia com vinagre ou com amoníaco liberta gases tóxicos. Usa um produto de cada vez e enxagua bem entre eles. Se respirares os fumos, sai para o ar livre e liga ao CIAV: 800 250 250.' },
  { id: 'laundry-bedding', category: 'laundry', icon: 'softener', source: 'Allergy UK',
    title: 'Roupa de cama a 60 °C, uma vez por semana',
    text: 'A 60 °C ou mais morrem os ácaros do pó. Se a etiqueta indicar uma temperatura mais baixa, segue a etiqueta.' },
  { id: 'food-leftovers', category: 'food', icon: 'g_fridge', source: 'USDA',
    title: 'Sobras: 3 a 4 dias no frigorífico',
    text: 'Passado esse tempo, come ou deita fora. Se não for para comer já, congela as sobras: é uma alternativa segura.' },
  { id: 'pets-chocolate', category: 'pets', icon: 'chocolate', when: 'pets', source: 'ASPCA',
    title: 'Chocolate é perigoso para cães e gatos',
    text: 'A teobromina é tóxica para eles, sobretudo no chocolate negro e de culinária. Guarda-o fora do alcance.' },
  { id: 'food-raw-chicken', category: 'food', icon: 'chicken', source: 'Food Standards Agency (Reino Unido)',
    title: 'Não laves o frango cru',
    text: 'Lavar espalha bactérias em gotículas pela bancada e pela roupa. Cozinhar bem já as elimina.' },
  { id: 'cleaning-washer-door', category: 'cleaning', icon: 'detergent', source: 'Siemens, AEG e Electrolux',
    title: 'Deixa a porta da máquina de lavar entreaberta',
    text: 'Depois de cada lavagem, deixa a porta entreaberta e limpa a borracha com um pano seco. Assim o interior seca e não aparece cheiro a bolor.' },
  { id: 'food-fridge-temp', category: 'food', icon: 'g_fridge', source: 'OMS e ASAE',
    title: 'Frigorífico a 5 °C ou menos',
    text: 'Os alimentos frescos conservam-se entre 0 e 5 °C. Um termómetro de frigorífico mostra se está certo.' },
  { id: 'safety-smoke-replace', category: 'safety', icon: 'battery', source: 'Bombeiros (NSW Fire & Rescue)',
    title: 'O detetor de fumo tem prazo: 10 anos',
    text: 'A data de fabrico vem impressa no aparelho. Conta 10 anos a partir dela, mesmo que ainda pareça funcionar.' },
  { id: 'pets-grapes', category: 'pets', icon: 'grapes', when: 'pets', source: 'ASPCA',
    title: 'Uvas e passas fazem mal a cães e gatos',
    text: 'Podem causar insuficiência renal e não se sabe que substância é a responsável, por isso nem uma pequena quantidade é segura.' },
  { id: 'food-raw-cooked', category: 'food', icon: 'meat', source: 'OMS e Food Standards Agency',
    title: 'Crus de um lado, cozinhados do outro',
    text: 'Usa facas e tábuas diferentes para carne crua e para comida pronta a comer, e arruma a carne crua em baixo no frigorífico, tapada, para os sucos não pingarem.' },
  { id: 'laundry-washer-clean', category: 'laundry', icon: 'detergent', source: 'Beko',
    title: 'Uma lavagem quente por mês, sem roupa',
    text: 'Uma lavagem a 60 °C ou mais, com a máquina vazia, ajuda a manter o tambor limpo. Vê no manual do teu modelo se tem programa próprio.' },
  { id: 'food-rice', category: 'food', icon: 'rice', source: 'NHS',
    title: 'Arroz cozinhado: arrefece depressa',
    text: 'O risco está no arroz que fica fora do frigorífico. Arrefece-o em cerca de 1 hora, come em 1 dia e reaquece só uma vez, até estar bem quente.' },
  { id: 'pets-onion', category: 'pets', icon: 'onion', when: 'pets', source: 'ASPCA',
    title: 'Cebola e alho: nem cozinhados',
    text: 'Danificam os glóbulos vermelhos de cães e gatos, e cozinhar não tira o perigo. Cuidado com restos de comida no prato.' },
  { id: 'food-reheat', category: 'food', icon: 'pasta', source: 'USDA',
    title: 'Reaquece até estar bem quente por inteiro',
    text: 'As sobras devem chegar a 74 °C em todo o prato (a meio também). Mexe a meio do micro-ondas para o calor se espalhar.' },
  { id: 'food-freezer', category: 'food', icon: 'g_freezer', source: 'USDA',
    title: 'Congelador a −18 °C',
    text: 'A essa temperatura a comida congelada fica segura. Os alimentos mantêm melhor a qualidade durante uns meses; escreve a data no saco.' },
  { id: 'laundry-toys', category: 'laundry', icon: 'cotton', source: 'Allergy UK',
    title: 'Peluches que não vão a 60 °C',
    text: 'Põe o peluche num saco de plástico e deixa-o no congelador pelo menos 12 horas. É uma alternativa para reduzir os ácaros.' },
  { id: 'cleaning-washer-seal', category: 'cleaning', icon: 'cloth', source: 'Beko',
    title: 'Limpa as dobras da borracha da máquina',
    text: 'É lá em baixo, nas dobras, que a água fica parada. Passa um pano e verifica se há sujidade escondida.' },
  { id: 'pets-xylitol', category: 'pets', icon: 'nuts', when: 'pets', source: 'ASPCA',
    title: 'Xilitol é perigoso para cães',
    text: 'Está em pastilhas sem açúcar, rebuçados e algumas manteigas de amendoim. Lê o rótulo antes de partilhar.' },
  { id: 'food-wash-produce', category: 'food', icon: 'vegetables', source: 'FDA e CDC (EUA)',
    title: 'Lava fruta e legumes só com água corrente',
    text: 'Lava mesmo os que vais descascar, e não uses sabão, detergente nem lixívia: podem ficar absorvidos pelo alimento. Se vier em saco «pronto a comer» e já lavado, não precisas de o lavar outra vez.' },
  { id: 'food-cut-produce', category: 'food', icon: 'fruit', source: 'CDC (EUA)',
    title: 'Fruta ou legumes cortados vão ao frigorífico',
    text: 'Depois de descascar, cortar ou cozinhar, guarda-os no frigorífico em menos de 2 horas.' },
  { id: 'safety-co-heating', category: 'safety', icon: 'battery', source: 'Proteção Civil (ANEPC) e DGS',
    title: 'Não aqueças a casa com o fogão ou o forno',
    text: 'Fogão, forno, braseiros e grelhadores libertam monóxido de carbono, um gás sem cheiro. Mantém as divisões ventiladas. Com sintomas de intoxicação, sai para o ar livre e liga ao CIAV (800 250 250) ou, se for grave, ao 112.' },
  { id: 'energy-washer-temp', category: 'laundry', icon: 'detergent', source: 'DECO PROteste',
    title: 'Lava a 30–40 °C e poupas energia',
    text: 'Cerca de 90 % da energia de uma lavagem vai para aquecer a água. Nas máquinas recentes, 30–40 °C chegam para roupa pouco suja. Espera por uma carga cheia, mas sem apertar a roupa.' },
  { id: 'food-potato-onion', category: 'food', icon: 'potato', source: 'USDA FoodKeeper (via University of Maine Extension)',
    title: 'Batatas e cebolas não precisam de frigorífico',
    text: 'Conservam-se melhor num sítio fresco e seco, à temperatura ambiente.' },
];

// Dica «ativa» nesta data: muda de 3 em 3 dias (dias de Lisboa, contados desde 1970).
export const TIP_PERIOD_DAYS = 3;

export function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function tipPeriod(isoDate: string): number {
  return Math.floor(dayNumber(isoDate) / TIP_PERIOD_DAYS);
}

// As dicas que servem esta casa (as de animais só se houver cão ou gato)
export function tipsFor(pets: readonly string[] | null | undefined): Tip[] {
  const hasPet = !!pets && (pets.includes('dog') || pets.includes('cat'));
  return TIPS.filter((t) => t.when !== 'pets' || hasPet);
}

// `skip` é o «Outra dica» (só nesta sessão). A dica base não muda dentro do mesmo período de 3 dias.
export function tipForDate(isoDate: string, pets: readonly string[] | null | undefined, skip = 0): Tip | null {
  const list = tipsFor(pets);
  if (list.length === 0) return null;
  const i = (((tipPeriod(isoDate) + skip) % list.length) + list.length) % list.length;
  return list[i];
}
