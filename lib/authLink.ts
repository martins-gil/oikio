// Lê os parâmetros de uma ligação de recuperação (nestkeep://reset-password#access_token=…&refresh_token=…)
// ou de um erro (…#error_code=otp_expired&error_description=…). Aceita parâmetros depois de "?" ou de "#".
export function parseAuthLink(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const read = (text: string) => {
    for (const pair of text.split('&')) {
      const [key, value = ''] = pair.split('=');
      if (!key) continue;
      try {
        out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
      } catch {
        // parâmetro mal formado: ignora
      }
    }
  };
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.split('?')[1];
  if (query) read(query);
  if (hash) read(hash);
  return out;
}

// Endereço para onde o e-mail de recuperação devolve a pessoa à app (tem de estar nos "Redirect URLs" do Supabase)
export const RESET_REDIRECT = 'nestkeep://reset-password';

// ----- Guarda a última ligação de recuperação recebida -----
// A ligação chega à app antes de o ecrã "Nova palavra-passe" existir; por isso é apanhada logo no arranque (app/_layout)
// e guardada aqui para o ecrã a ler quando abrir.
let latest: string | null = null;
const listeners = new Set<() => void>();

export function rememberAuthUrl(url: string | null | undefined) {
  if (!url) return;
  const p = parseAuthLink(url);
  if (!(p.access_token || p.code || p.error || p.error_code)) return; // ignora outras ligações (ex.: a do servidor de desenvolvimento)
  latest = url;
  listeners.forEach((f) => f());
}
export const subscribeAuthUrl = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export const getAuthUrl = () => latest;
export function clearAuthUrl() {
  latest = null;
}
