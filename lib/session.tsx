import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type SessionState = { session: Session | null; loading: boolean; error: string | null };

const SessionContext = createContext<SessionState>({ session: null, loading: true, error: null });

// Garante que há sempre uma sessão: se não existir, entra como utilizador anónimo.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true, error: null });

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (active) setState({ session: data.session, loading: false, error: null });
        return;
      }
      const { data: anon, error } = await supabase.auth.signInAnonymously();
      if (!active) return;
      setState({
        session: anon.session,
        loading: false,
        error: error ? 'Não foi possível iniciar sessão. Verifica a ligação e tenta outra vez.' : null,
      });
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({ ...prev, session }));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
