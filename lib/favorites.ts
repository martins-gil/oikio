// Refeições favoritas da casa (⭐). Guardam a receita e os ingredientes; as duas pessoas veem as mesmas.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useHousehold } from './household';
import type { Meal } from './meals';
import { supabase } from './supabase';

export type Favorite = {
  id: string;
  title: string;
  meal: Pick<Meal, 'title' | 'why' | 'time_minutes' | 'difficulty' | 'servings' | 'equipment' | 'contains' | 'steps'>;
  ingredients: { product_id: string | null; name: string; quantity: number | null; unit: string | null }[];
};

export const FAVORITE_COLOR = '#FFBF67'; // o amarelo do logótipo (colors.accent)

export function useFavorites() {
  const { household } = useHousehold();
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  const reload = useCallback(async () => {
    if (!household) return;
    const { data } = await supabase.from('favorite_meals').select('id, title, meal, ingredients').eq('household_id', household.id).order('created_at', { ascending: false });
    setFavorites((data ?? []) as Favorite[]);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const find = (title: string) => favorites.find((f) => f.title.toLowerCase() === title.trim().toLowerCase());

  // Põe ou tira a estrela. Devolve o texto para o aviso, ou null se falhou.
  const toggle = async (meal: Meal): Promise<string | null> => {
    if (!household) return null;
    const existing = find(meal.title);
    if (existing) {
      const { error } = await supabase.from('favorite_meals').delete().eq('id', existing.id);
      if (error) return null;
      await reload();
      return 'Tirada das favoritas';
    }
    const { error } = await supabase.rpc('save_favorite', { p_household: household.id, p_meal: meal });
    if (error) return null;
    await reload();
    return '⭐ Guardada nas favoritas';
  };

  return { favorites, find, toggle, reload };
}
