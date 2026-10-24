// Envia os lembretes diários (M7b). Chamada de hora a hora pelo agendador da base de dados (pg_cron + pg_net).
// A base de dados decide quem recebe e o texto (due_notifications); esta função só os entrega pelo serviço de push do Expo.
// Segredos (só nos secrets do Supabase, nunca no código): CRON_SECRET. O SUPABASE_SERVICE_ROLE_KEY é injetado pelo Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // limite do serviço do Expo por pedido

type Due = { user_id: string; token: string; title: string; body: string };
type Ticket = { status: 'ok' | 'error'; details?: { error?: string } };

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

  for (let i = 0; i < due.length; i += BATCH) {
    const chunk = due.slice(i, i + BATCH);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map((d) => ({ to: d.token, title: d.title, body: d.body, sound: 'default', channelId: 'default' })),
      ),
    });
    if (!res.ok) continue;
    const tickets = ((await res.json()).data ?? []) as Ticket[];
    tickets.forEach((t, k) => {
      if (t.status === 'ok') sent++;
      else if (t.details?.error === 'DeviceNotRegistered') dead.push(chunk[k].token); // app desinstalada: esquece o token
    });
  }

  if (dead.length > 0) await supabase.from('push_tokens').delete().in('token', dead);

  return new Response(JSON.stringify({ due: due.length, sent, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
