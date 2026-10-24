import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

export type Household = { id: string; name: string };
export type Member = {
  user_id: string;
  display_name: string;
  role: 'admin' | 'adult' | 'child';
  joined_at: string;
};

type HouseholdState = {
  household: Household | null;
  members: Member[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  members: [],
  loading: true,
  error: null,
  reload: async () => {},
});

// Procura a casa do utilizador (a RLS só devolve casas de que é membro), com os membros,
// e partilha-a por toda a app.
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('households')
      .select('id, name')
      .limit(1)
      .maybeSingle();
    setError(err ? 'Não foi possível carregar a casa.' : null);
    setHousehold(data);
    if (data) {
      const { data: rows } = await supabase.rpc('household_members_info', { p_household: data.id });
      setMembers((rows ?? []) as Member[]);
    } else {
      setMembers([]);
    }
    setLoading(false);
  }, []);

  // Muda a pessoa com sessão (entrar, sair, aceitar convite): recomeça do zero
  useEffect(() => {
    setHousehold(null);
    setMembers([]);
    if (userId) {
      setLoading(true);
      reload();
    }
  }, [userId, reload]);

  return (
    <HouseholdContext.Provider value={{ household, members, loading, error, reload }}>
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
