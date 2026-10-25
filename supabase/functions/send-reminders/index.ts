// Envia os lembretes diários (M7b). Chamada de hora a hora pelo agendador da base de dados (pg_cron + pg_net).
// A base de dados decide quem recebe e o texto (due_notifications); esta função só os entrega pelo serviço de push do Expo.
// Segredos (só nos secrets do Supabase, nunca no código): CRON_SECRET. O SUPABASE_SERVICE_ROLE_KEY é injetado pelo Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // limite do serviço do Expo por pedido

type Due = { user_id: string; token: string; title: string; body: string };
type Ticket = { id?: string; status: 'ok' | 'error'; message?: string; details?: { error?: string } };
type Receipt = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase.rpc('due_notifications');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const due = (data ?? []) as Due[];
  let sent = 0;
  const dead: string[] = [];
  const errors: string[] = [];
  const ticketIds: { id: string; token: string }[] = [];
  const debug = req.headers.get('x-debug') === '1'; // teste manual: espera pelos recibos e diz porque falhou

  for (let i = 0; i < due.length; i += BATCH) {
    const chunk = due.slice(i, i + BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map((d) => ({ to: d.token, title: d.title, body: d.body, sound: 'default', channelId: 'default' })),
      ),
    });
    if (!res.ok) {
      errors.push(`Expo respondeu ${res.status}`);
      continue;
    }
    const tickets = ((await res.json()).data ?? []) as Ticket[];
    tickets.forEach((t, k) => {
      if (t.status === 'ok') {
        sent++;
        if (t.id) ticketIds.push({ id: t.id, token: chunk[k].token });
      } else if (t.details?.error === 'DeviceNotRegistered') {
        dead.push(chunk[k].token); // app desinstalada: esquece o token
      } else {
        errors.push(`${t.details?.error ?? 'erro'}: ${t.message ?? ''}`.slice(0, 300));
      }
    });
  }

  // Só no teste manual (x-debug: 1): o Expo entrega ao Firebase uns segundos depois; os recibos dizem se correu bem
  if (debug && ticketIds.length > 0) {
    await new Promise((r) => setTimeout(r, 6000));
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: ticketIds.map((t) => t.id) }),
    });
    const receipts = ((await res.json()).data ?? {}) as Record<string, Receipt>;
    for (const t of ticketIds) {
      const r = receipts[t.id];
      if (!r) errors.push('recibo ainda não disponível (tenta daqui a uns segundos)');
      else if (r.status === 'error') {
        if (r.details?.error === 'DeviceNotRegistered') dead.push(t.token);
        errors.push(`${r.details?.error ?? 'erro'}: ${r.message ?? ''}`.slice(0, 300));
      }
    }
  }

  if (dead.length > 0) await supabase.from('push_tokens').delete().in('token', dead);

  return new Response(JSON.stringify({ due: due.length, sent, removed: dead.length, errors }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
