import { useCallback, useEffect, useState } from 'react';

import { useSession } from './session';
import { supabase } from './supabase';

export type Household = { id: string; name: string };

// Procura a casa do utilizador (a RLS só devolve casas de que é membro).
export function useHousehold() {
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

  return { household, loading, error, reload };
}
