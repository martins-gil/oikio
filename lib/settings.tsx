// Definições pessoais (cada pessoa só vê e altera as suas; tabela `user_settings` com RLS).
// Um único carregamento partilhado por toda a app; tudo desligado por defeito para quem é novo.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

// Módulos opcionais: o núcleo (Resumo, Produtos, Compras) está sempre ligado
export type ModuleKey = 'meals' | 'money' | 'personal';
export const MODULES: { key: ModuleKey; emoji: string; title: string; detail: string }[] = [
  { key: 'meals', emoji: '🍽️', title: 'Refeições', detail: 'Ideias do que cozinhar, plano da semana e favoritas.' },
  { key: 'money', emoji: '💶', title: 'Dinheiro', detail: 'Despesas da casa, orçamentos e análise.' },
  { key: 'personal', emoji: '🔒', title: 'Pessoal', detail: 'Tarefas só tuas e banco de horas.' },
];

type Settings = { show_costs: boolean; show_expiry: boolean; show_ai_explain: boolean; modules: ModuleKey[] };
type BoolKey = 'show_costs' | 'show_expiry' | 'show_ai_explain';

const DEFAULTS: Settings = { show_costs: false, show_expiry: false, show_ai_explain: false, modules: [] };

type Ctx = {
  settings: Settings;
  loaded: boolean;
  set: (key: BoolKey, value: boolean) => Promise<boolean>;
  setModule: (key: ModuleKey, on: boolean) => Promise<boolean>;
  setModules: (keys: ModuleKey[]) => Promise<boolean>; // define todos de uma vez
};
const SettingsContext = createContext<Ctx>({ settings: DEFAULTS, loaded: false, set: async () => false, setModule: async () => false, setModules: async () => false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const me = session?.user.id;
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(DEFAULTS);
    setLoaded(false);
    if (!me) return;
    let active = true;
    (async () => {
      let { data, error } = await supabase.from('user_settings').select('show_costs, show_expiry, show_ai_explain, modules').eq('user_id', me).maybeSingle();
      if (error) {
        // Falta aplicar a migração mais recente (colunas novas): lê só as definições mais antigas
        const old = await supabase.from('user_settings').select('show_costs').eq('user_id', me).maybeSingle();
        data = old.data as typeof data;
      }
      if (!active) return;
      const row = data as Partial<Settings> | null;
      setSettings({
        show_costs: !!row?.show_costs,
        show_expiry: !!row?.show_expiry,
        show_ai_explain: !!row?.show_ai_explain,
        modules: ((row?.modules ?? []) as ModuleKey[]).filter((m) => MODULES.some((x) => x.key === m)),
      });
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [me]);

  // Só envia a definição que mudou (as outras ficam como estão)
  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!me) return false;
      const { error } = await supabase.from('user_settings').upsert({ user_id: me, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      return !error;
    },
    [me],
  );

  const set = useCallback(
    async (key: BoolKey, value: boolean) => {
      setSettings((s) => ({ ...s, [key]: value }));
      const ok = await save({ [key]: value });
      if (!ok) setSettings((s) => ({ ...s, [key]: !value }));
      return ok;
    },
    [save],
  );

  const setModule = useCallback(
    async (key: ModuleKey, on: boolean) => {
      const next = on ? [...new Set([...settings.modules, key])] : settings.modules.filter((m) => m !== key);
      const before = settings.modules;
      setSettings((s) => ({ ...s, modules: next }));
      const ok = await save({ modules: next });
      if (!ok) setSettings((s) => ({ ...s, modules: before }));
      return ok;
    },
    [save, settings.modules],
  );

  const setModules = useCallback(
    async (keys: ModuleKey[]) => {
      const next = [...new Set(keys)];
      const before = settings.modules;
      setSettings((s) => ({ ...s, modules: next }));
      const ok = await save({ modules: next });
      if (!ok) setSettings((s) => ({ ...s, modules: before }));
      return ok;
    },
    [save, settings.modules],
  );

  return <SettingsContext.Provider value={{ settings, loaded, set, setModule, setModules }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

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

// «Explicações com IA» (Explica-me)
export function useShowAiExplain() {
  const { settings, loaded, set } = useSettings();
  return { showAiExplain: settings.show_ai_explain, loaded, setShowAiExplain: (v: boolean) => set('show_ai_explain', v) };
}

// Módulos opcionais ligados por esta pessoa
export function useModules() {
  const { settings, loaded, setModule, setModules } = useSettings();
  return { has: (key: ModuleKey) => settings.modules.includes(key), loaded, setModule, setModules };
}
