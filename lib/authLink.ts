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
