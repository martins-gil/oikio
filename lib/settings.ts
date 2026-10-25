// Definições pessoais (cada pessoa só vê e altera as suas; tabela `user_settings` com RLS).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

// «Mostrar custos e orçamento»: desligado por defeito. Quem não quer saber de dinheiro não vê preços nas refeições.
export function useShowCosts() {
  const { session } = useSession();
  const me = session?.user.id;
  const [showCosts, setShow] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      supabase
        .from('user_settings')
        .select('show_costs')
        .eq('user_id', me)
        .maybeSingle()
        .then(({ data }) => {
          setShow(!!data?.show_costs);
          setLoaded(true);
        });
    }, [me]),
  );

  const setShowCosts = async (value: boolean) => {
    if (!me) return false;
    setShow(value);
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: me, show_costs: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) setShow(!value);
    return !error;
  };

  return { showCosts, loaded, setShowCosts };
}
