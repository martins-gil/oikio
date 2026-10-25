// Definições pessoais (cada pessoa só vê e altera as suas; tabela `user_settings` com RLS).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

type Settings = { show_costs: boolean; show_expiry: boolean };
type Key = keyof Settings;

// Tudo desligado por defeito: quem não quer saber de dinheiro ou de validades não vê nada disso.
export function useSettings() {
  const { session } = useSession();
  const me = session?.user.id;
  const [settings, setSettings] = useState<Settings>({ show_costs: false, show_expiry: false });
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      supabase
        .from('user_settings')
        .select('show_costs, show_expiry')
        .eq('user_id', me)
        .maybeSingle()
        .then(({ data }) => {
          setSettings({ show_costs: !!data?.show_costs, show_expiry: !!data?.show_expiry });
          setLoaded(true);
        });
    }, [me]),
  );

  // Só envia a definição que mudou (as outras ficam como estão)
  const set = async (key: Key, value: boolean) => {
    if (!me) return false;
    setSettings((s) => ({ ...s, [key]: value }));
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: me, [key]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) setSettings((s) => ({ ...s, [key]: !value }));
    return !error;
  };

  return { settings, loaded, set };
}

// «Mostrar custos e orçamento»
export function useShowCosts() {
  const { settings, loaded, set } = useSettings();
  return { showCosts: settings.show_costs, loaded, setShowCosts: (v: boolean) => set('show_costs', v) };
}

// «Mostrar validades sugeridas»
export function useShowExpiry() {
  const { settings, loaded, set } = useSettings();
  return { showExpiry: settings.show_expiry, loaded, setShowExpiry: (v: boolean) => set('show_expiry', v) };
}
