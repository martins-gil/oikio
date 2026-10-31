// Entrar (ou ligar a conta) com Google ou Apple. Abre o navegador do sistema (nunca uma janela dentro da app, que o Google recusa),
// a pessoa autoriza e volta à app por `nestkeep://auth-callback` com a sessão. Quem escolhe os fornecedores é o painel do Supabase;
// a app não guarda nenhuma chave deles. Ver docs/login-google-apple.md.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { devHint } from './errors';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google' | 'apple';
export type SocialResult = { ok: true } | { ok: false; cancelled: boolean; message: string };

// «signin» entra numa conta que já existe (recuperar a casa noutro telemóvel); «link» junta o Google/Apple à conta
// anónima atual, sem perder a casa (Proteger a conta).
export type SocialMode = 'signin' | 'link';

// A Apple só se mostra ativa quando a conta de programador estiver pronta e o fornecedor ligado no Supabase
export const APPLE_ENABLED = process.env.EXPO_PUBLIC_APPLE_LOGIN === '1';

const NAME: Record<SocialProvider, string> = { google: 'Google', apple: 'Apple' };

function readParams(url: string): URLSearchParams {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(query);
  new URLSearchParams(hash).forEach((v, k) => params.set(k, v));
  return params;
}

function friendly(provider: SocialProvider, raw: string): string {
  if (/already|linked|exists|another user/i.test(raw)) return `Esta conta ${NAME[provider]} já está ligada a outra conta NestKeep.`;
  if (/manual linking/i.test(raw)) return devHint('Falta ativar «Allow manual linking» no Supabase (Authentication → Sign In / Providers).');
  if (/not enabled|unsupported provider|provider is not/i.test(raw)) return devHint(`O ${NAME[provider]} ainda não está ligado no Supabase (Authentication → Providers).`);
  if (/denied|cancel/i.test(raw)) return `Cancelaste a entrada com ${NAME[provider]}.`;
  return `Não foi possível entrar com ${NAME[provider]}. Tenta outra vez.`;
}

export async function socialAuth(provider: SocialProvider, mode: SocialMode): Promise<SocialResult> {
  try {
    const redirectTo = Linking.createURL('auth-callback');
    const options = { redirectTo, skipBrowserRedirect: true };
    const { data, error } =
      mode === 'link'
        ? await supabase.auth.linkIdentity({ provider, options })
        : await supabase.auth.signInWithOAuth({ provider, options });
    if (error || !data?.url) return { ok: false, cancelled: false, message: friendly(provider, error?.message ?? '') };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { ok: false, cancelled: true, message: '' };

    const params = readParams(result.url);
    const problem = params.get('error_description') ?? params.get('error');
    if (problem) return { ok: false, cancelled: false, message: friendly(provider, problem.replace(/\+/g, ' ')) };

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return { ok: false, cancelled: false, message: friendly(provider, '') };
    const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionError) return { ok: false, cancelled: false, message: friendly(provider, sessionError.message) };
    return { ok: true };
  } catch {
    return { ok: false, cancelled: false, message: friendly(provider, '') };
  }
}
