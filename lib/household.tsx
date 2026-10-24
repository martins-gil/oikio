import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

export type Household = { id: string; name: string };

type HouseholdState = {
  household: Household | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const HouseholdContext = createContext<HouseholdState>({
  household: null,
  loading: true,
  error: null,
  reload: async () => {},
});

// Procura a casa do utilizador (a RLS só devolve casas de que é membro) e partilha-a por toda a app.
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [household, setHousehold] = useState<Household | null>(null);
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
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) reload();
  }, [session, reload]);

  return (
    <HouseholdContext.Provider value={{ household, loading, error, reload }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export const useHousehold = () => useContext(HouseholdContext);
