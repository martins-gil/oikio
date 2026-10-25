// Perfil de cozinha da casa: as opções do assistente (chaves fixas, iguais às validadas na base de dados).
import type { ImageSourcePropType } from 'react-native';

export const SCHEDULES = [
  { key: 'workweek', title: 'Semana de trabalho', detail: 'Almoço e jantar, seg–sex', emoji: '💼', meals: 10 },
  { key: 'lunchbox', title: 'Marmitas para o trabalho', detail: 'Almoço, seg–sex', emoji: '🍱', meals: 5 },
  { key: 'dinners', title: 'Jantares', detail: 'Jantar, todos os dias', emoji: '🌙', meals: 7 },
  { key: 'everything', title: 'Tudo', detail: 'Três refeições, todos os dias', emoji: '🍽️', meals: 21 },
] as const;
export type ScheduleKey = (typeof SCHEDULES)[number]['key'];

export const CRAVINGS = [
  { key: 'quick', label: 'Rápido e fácil', emoji: '⏱️' },
  { key: 'low_calorie', label: 'Baixa caloria', emoji: '🥗' },
  { key: 'comfort', label: 'Comfort food', emoji: '🍲' },
  { key: 'healthy', label: 'Saudável', emoji: '🥦' },
  { key: 'homemade_delivery', label: 'Delivery caseiro', emoji: '🍔' },
  { key: 'gut_friendly', label: 'Amigo do intestino', emoji: '🫐' },
  { key: 'high_protein', label: 'Rico em proteína', emoji: '🍗' },
] as const;

export const COOK_STYLES = [
  { key: 'batch', title: 'Faço marmitas', detail: 'Cozinha algumas porções grandes e come ao longo da semana', emoji: '🍱' },
  { key: 'fresh', title: 'Fresco a cada refeição', detail: 'Cozinha algo novo a cada refeição', emoji: '🍳' },
] as const;

export const EQUIPMENT: { key: string; label: string; image: ImageSourcePropType }[] = [
  { key: 'stove', label: 'Fogão', image: require('../assets/equipment/stove.png') },
  { key: 'oven', label: 'Forno', image: require('../assets/equipment/oven.png') },
  { key: 'microwave', label: 'Micro-ondas', image: require('../assets/equipment/microwave.png') },
  { key: 'air_fryer', label: 'Air fryer', image: require('../assets/equipment/air_fryer.png') },
  { key: 'pressure_cooker', label: 'Panela de pressão', image: require('../assets/equipment/pressure_cooker.png') },
  { key: 'slow_cooker', label: 'Cozedura lenta', image: require('../assets/equipment/slow_cooker.png') },
  { key: 'thermomix', label: 'Bimby / Thermomix', image: require('../assets/equipment/thermomix.png') },
  { key: 'blender', label: 'Varinha mágica', image: require('../assets/equipment/blender.png') },
  { key: 'food_processor', label: 'Robô de cozinha', image: require('../assets/equipment/food_processor.png') },
  { key: 'stand_mixer', label: 'Batedeira', image: require('../assets/equipment/stand_mixer.png') },
  { key: 'grill', label: 'Grelhador', image: require('../assets/equipment/grill.png') },
  { key: 'toaster', label: 'Torradeira', image: require('../assets/equipment/toaster.png') },
  { key: 'rice_cooker', label: 'Panela de arroz', image: require('../assets/equipment/rice_cooker.png') },
  { key: 'steamer', label: 'Cozedor a vapor', image: require('../assets/equipment/steamer.png') },
];

export const RESTRICTIONS = [
  { key: 'gluten', label: 'Sem glúten' },
  { key: 'lactose', label: 'Sem lactose' },
  { key: 'nuts', label: 'Frutos secos' },
  { key: 'shellfish', label: 'Marisco' },
  { key: 'eggs', label: 'Ovos' },
  { key: 'fish', label: 'Peixe' },
  { key: 'pork', label: 'Porco' },
  { key: 'vegetarian', label: 'Vegetariano' },
  { key: 'vegan', label: 'Vegano' },
] as const;

export type CookingProfile = {
  schedule: ScheduleKey;
  diners: number;
  weekly_budget_cents: number | null;
  cravings: string[];
  cook_style: 'batch' | 'fresh';
  equipment: string[];
  restrictions: string[];
  restrictions_note: string | null;
};

export const DEFAULT_PROFILE: CookingProfile = {
  schedule: 'workweek',
  diners: 2,
  weekly_budget_cents: null,
  cravings: [],
  cook_style: 'fresh',
  equipment: ['stove', 'oven'],
  restrictions: [],
  restrictions_note: null,
};

export const PROFILE_COLUMNS = 'schedule, diners, weekly_budget_cents, cravings, cook_style, equipment, restrictions, restrictions_note';
