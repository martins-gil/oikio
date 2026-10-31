import type { ProductIconKey } from '@/lib/productIconAssets';
import type { Place } from '@/lib/stock';

// Que desenho (assets/products, gerados por design/products.mjs) mostra cada produto.
// Escolhe pelas palavras do nome (sem acentos, a começar na palavra, para apanhar o plural); a ordem conta: o mais específico primeiro.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const RULES: [RegExp, ProductIconKey][] = [
  // frescos mais específicos primeiro
  [/\b(queijo cottage|cottage|requeijao|queijo fresco|quark)/, 'cottage'],
  [/\b(queijo|mozarela|mozzarella|parmesao|emmental|flamengo|serra|brie)/, 'cheese'],
  [/\b(iogurte|skyr|kefir|gelatina|pudim)/, 'yogurt'],
  [/\b(natas|creme culinario|nata)\b/, 'cream'],
  [/\b(leite)/, 'milk'],
  [/\b(manteiga|margarina)/, 'butter'],
  [/\b(ovo)/, 'eggs'],
  [/\b(fiambre|presunto|bacon|peito de peru|mortadela|charcutaria)/, 'ham'],
  [/\b(chourico|salsicha|linguica|salame|alheira|farinheira|morcela)/, 'sausage'],
  [/\b(frango|coxa|peru|pato|perna)/, 'chicken'],
  [/\b(carne|bife|vaca|porco|borrego|vitela|hamburguer|picada|costeleta|entrecosto|lombo|febra)/, 'meat'],
  [/\b(peixe|salmao|bacalhau|pescada|dourada|robalo|sardinha|camarao|marisco|polvo|lula|choco|carapau|atum fresco)/, 'fish'],
  // fruta
  [/\b(maca|pera|pessego|nectarina|ameixa|cereja)/, 'apple'],
  [/\b(banana)/, 'banana'],
  [/\b(laranja|tangerina|clementina|dospiro|diospiro|manga|papaia)/, 'orange'],
  [/\b(limao|lima)\b/, 'lemon'],
  [/\b(uva)/, 'grapes'],
  [/\b(morango|framboesa|mirtilo|amora)/, 'strawberry'],
  [/\b(abacate)/, 'avocado'],
  [/\b(melao|melancia|ananas|kiwi|fruta)/, 'fruit'],
  // legumes
  [/\b(pepino|curgete|courgette)/, 'cucumber'],
  [/\b(tomate)/, 'tomato'],
  [/\b(cenoura)/, 'carrot'],
  [/\b(cebola)/, 'onion'],
  [/\b(alho)\b/, 'garlic'],
  [/\b(batata)/, 'potato'],
  [/\b(alface|salada|espinafre|couve|agriao|rucula|reposteiro|legumes frescos)/, 'lettuce'],
  [/\b(brocolo|brocolos|couve flor|couve-flor)/, 'broccoli'],
  [/\b(pimento)/, 'pepper'],
  [/\b(cogumelo)/, 'mushroom'],
  [/\b(milho)/, 'corn'],
  [/\b(feijao|grao|lentilha|ervilha|favas|tremoco)/, 'beans'],
  [/\b(legume)/, 'vegetables'],
  // despensa
  [/\b(arroz)/, 'rice'],
  [/\b(massa|esparguete|macarrao|fusilli|noodle|lasanha|penne)/, 'pasta'],
  [/\b(farinha|fermento|amido)/, 'flour'],
  [/\b(acucar|adocante)/, 'sugar'],
  [/\b(sal)\b/, 'salt'],
  [/\b(cafe|capsula de cafe|capsulas de cafe)/, 'coffee'],
  [/\b(cha|infusao|tisana)\b/, 'tea'],
  [/\b(cereais|aveia|granola|musli|flocos)/, 'cereal'],
  [/\b(atum|sardinhas em lata|conserva)/, 'tuna'],
  [/\b(lata)\b/, 'canned'],
  [/\b(molho|ketchup|maionese|mostarda|polpa|concentrado)/, 'sauce'],
  [/\b(azeite|oleo)/, 'oil'],
  [/\b(vinagre)/, 'vinegar'],
  [/\b(mel)\b/, 'honey'],
  [/\b(compota|marmelada|doce|nutella|creme de avela)/, 'jam'],
  [/\b(chocolate|cacau)/, 'chocolate'],
  [/\b(bolacha|biscoito|bolo|croissant|bolachas)/, 'cookies'],
  [/\b(baguete|baguette)/, 'baguette'],
  [/\b(pao|torrada|broa|padaria)/, 'bread'],
  [/\b(frutos secos|amendoa|noz|nozes|amendoim|caju|pistacio|avela)/, 'nuts'],
  // bebidas
  [/\b(agua)/, 'water'],
  [/\b(sumo|refresco|nectar)/, 'juice'],
  [/\b(refrigerante|coca|cola|fanta|sprite|gaseificad|tonica)/, 'soda'],
  [/\b(cerveja|imperial|mini)\b/, 'beer'],
  [/\b(vinho|espumante|champanhe|porto|licor|whisky|vodka|gin)/, 'wine'],
  // congelados
  [/\b(gelado)/, 'icecream'],
  [/\b(pizza)/, 'pizza'],
  // limpeza e casa
  [/\b(pastilha|capsula|tablete)/, 'tabs'],
  [/\b(detergente da loica|detergente loica|loica|fairy|lava loica)/, 'dishsoap'],
  [/\b(amaciador)/, 'softener'],
  [/\b(detergente|omo|skip|ariel|roupa)/, 'detergent'],
  [/\b(lixivia|javel|desinfetante|wc|desentupidor)/, 'bleach'],
  [/\b(limpa vidros|limpa-vidros|vidros)/, 'glass'],
  [/\b(desengordurante|multiusos|multi usos|limpa cozinha|limpa casa de banho)/, 'degreaser'],
  [/\b(esponja|esfregao|palha de aco|escova de loica)/, 'sponge'],
  [/\b(pano|panos|toalhete|microfibra)/, 'cloth'],
  [/\b(saco do lixo|sacos do lixo|sacos de lixo|saco de lixo)/, 'trashbags'],
  [/\b(reciclagem)/, 'recycle'],
  [/\b(papel higienico)/, 'toiletpaper'],
  [/\b(rolo de cozinha|rolos de cozinha|papel de cozinha|rolos)/, 'kitchenroll'],
  [/\b(guardanapo)/, 'napkins'],
  [/\b(aluminio|pelicula|film)/, 'foil'],
  [/\b(pilha|bateria)/, 'battery'],
  [/\b(lampada)/, 'bulb'],
  // higiene
  [/\b(champo|condicionador|mascara capilar)/, 'shampoo'],
  [/\b(gel de banho|sabonete liquido|gel duche|gel de duche)/, 'showergel'],
  [/\b(pasta de dentes|dentifrico|pasta dentifrica)/, 'toothpaste'],
  [/\b(escova de dentes|escova dentes|elixir|fio dentario)/, 'toothbrush'],
  [/\b(desodorizante|desodorizante)/, 'deodorant'],
  [/\b(sabonete)/, 'soap'],
  [/\b(gilete|lamina|barbear|aparelho de barbear)/, 'razor'],
  [/\b(algodao|cotonete|discos|disco)/, 'cotton'],
  [/\b(lenco|lencos|kleenex|toalhitas)/, 'tissues'],
  [/\b(fralda)/, 'diapers'],
  // animais
  [/\b(areia)/, 'catlitter'],
  [/\b(racao|comida de gato|comida de cao|comida para)/, 'petfood'],
];

const FROZEN: Partial<Record<ProductIconKey, ProductIconKey>> = {
  meat: 'frozen_meat', chicken: 'frozen_chicken', fish: 'frozen_fish', bread: 'frozen_bread', broccoli: 'frozen_broccoli', lettuce: 'frozen_broccoli',
  vegetables: 'frozen_broccoli', pizza: 'frozen_pizza',
};

const BY_PLACE: Record<Place, ProductIconKey> = {
  pantry: 'g_pantry', fridge: 'g_fridge', freezer: 'g_freezer', cleaning: 'g_cleaning', other: 'g_other',
};

// Nomes dos produtos sugeridos (que a base de dados conhece) valem como qualquer outro nome: as regras acima cobrem-nos a todos.
export function productIconKey(name: string, place: Place): ProductIconKey {
  const n = norm(name);
  const hit = RULES.find(([re]) => re.test(n))?.[1];
  if (!hit) return BY_PLACE[place];
  // congelado: se o nome o diz, ou se está no congelador, usa a versão com floco de neve (quando existe)
  if (place === 'freezer' || /congelad/.test(n)) return FROZEN[hit] ?? hit;
  return hit;
}

// Desenhos das categorias de despesas (ecrã Dinheiro)
export const CATEGORY_ICON_KEY: Record<string, ProductIconKey> = {
  Supermercado: 'cat_super',
  Casa: 'cat_home',
  Contas: 'cat_bills',
  Saúde: 'cat_health',
  Lazer: 'cat_leisure',
  Outros: 'cat_other',
};
