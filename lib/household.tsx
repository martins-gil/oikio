import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

export type GamificationMode = 'off' | 'weekly_summary' | 'competition';
export type Household = { id: string; name: string; gamification: GamificationMode; role?: Member['role'] };
export type Member = {
  user_id: string;
  display_name: string;
  role: 'admin' | 'adult' | 'child';
  joined_at: string;
};

type HouseholdState = {
  household: Household | null; // a casa ativa
  households: Household[]; // todas as casas desta pessoa
  members: Member[]; // membros da casa ativa
  loading: boolean;
  error: string | null;
  reload: (preferId?: string) => Promise<void>; // recarrega; `preferId` torna essa casa a ativa (ex.: a que acabou de criar)
  setActiveHousehold: (id: string) => Promise<void>; // escolhe a casa (e dá a escolha por feita)
  needsPick: boolean; // várias casas e ainda não escolheu nesta abertura da app: mostra o menu «Escolhe a casa»
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  households: [],
  members: [],
  loading: true,
  error: null,
  reload: async () => {},
  setActiveHousehold: async () => {},
  needsPick: false,
});

// Chave onde cada telemóvel guarda a casa ativa de cada pessoa
const activeKey = (userId: string) => `nestkeep.activeHousehold.${userId}`;

// Procura as casas da pessoa (a RLS só devolve casas de que é membro), escolhe a ativa (a última usada neste telemóvel)
// e carrega os membros dela. Uma pessoa pode pertencer a várias casas.
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const [selected, setSelected] = useState(false); // já escolheu a casa nesta abertura da app

  const loadMembers = useCallback(async (id: string | null) => {
    if (!id) return setMembers([]);
    const { data: rows } = await supabase.rpc('household_members_info', { p_household: id });
    setMembers((rows ?? []) as Member[]);
  }, []);

  const choose = useCallback(
    async (id: string | null) => {
      activeRef.current = id;
      setActiveId(id);
      if (userId && id) AsyncStorage.setItem(activeKey(userId), id).catch(() => {});
      await loadMembers(id);
    },
    [userId, loadMembers],
  );

  const reload = useCallback(
    async (preferId?: string) => {
      if (!userId) return;
      const { data, error: err } = await supabase
        .from('household_members')
        .select('role, joined_at, households(id, name, gamification)')
        .eq('user_id', userId)
        .order('joined_at');
      setError(err ? 'Não foi possível carregar a casa.' : null);
      const list = ((data ?? []) as unknown as { role: Member['role']; households: Household | Household[] | null }[])
        .flatMap((r): Household[] => {
          const h = Array.isArray(r.households) ? r.households[0] : r.households;
          return h ? [{ ...h, role: r.role }] : [];
        });
      setHouseholds(list);
      // Só uma casa: vai direto para a app. Com várias, pergunta qual (a menos que acabe de criar ou entrar numa).
      if (list.length <= 1 || preferId) setSelected(true);

      let stored: string | null = null;
      try {
        stored = await AsyncStorage.getItem(activeKey(userId));
      } catch {
        stored = null;
      }
      const wanted = [preferId, activeRef.current, stored].find((id) => id && list.some((h) => h.id === id)) ?? list[0]?.id ?? null;
      // Mudou a casa ativa (criou, entrou ou saiu de uma): os ecrãs recomeçam do zero, para nunca aparecerem dados da casa anterior
      if (activeRef.current && wanted !== activeRef.current) setLoading(true);
      await choose(wanted);
      setLoading(false);
    },
    [userId, choose],
  );

  const setActiveHousehold = useCallback(
    async (id: string) => {
      if (!households.some((h) => h.id === id)) return;
      setSelected(true);
      if (id === activeRef.current) return;
      setLoading(true);
      await choose(id);
      setLoading(false);
    },
    [households, choose],
  );

  // Muda a pessoa com sessão (entrar, sair, aceitar convite): recomeça do zero
  useEffect(() => {
    setHouseholds([]);
    setMembers([]);
    setActiveId(null);
    setSelected(false);
    activeRef.current = null;
    if (userId) {
      setLoading(true);
      reload();
    }
  }, [userId, reload]);

  const household = households.find((h) => h.id === activeId) ?? null;

  return (
    <HouseholdContext.Provider value={{ household, households, members, loading, error, reload, setActiveHousehold, needsPick: !loading && households.length > 1 && !selected }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export const useHousehold = () => useContext(HouseholdContext);

export const ROLE_LABEL: Record<Member['role'], string> = {
  admin: 'Administrador(a)',
  adult: 'Adulto(a)',
  child: 'Criança',
};

// "K7M2XQ9P4T" → "K7M2-XQ9P-4T"
export const formatInviteCode = (code: string) =>
  [code.slice(0, 4), code.slice(4, 8), code.slice(8)].filter(Boolean).join('-');

export const GAMIFICATION_LABEL: Record<GamificationMode, string> = {
  off: 'Desligado',
  weekly_summary: 'Resumo semanal',
  competition: 'Competição amigável',
};
