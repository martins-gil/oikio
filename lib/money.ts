// Dinheiro sempre em cêntimos (inteiros), moeda EUR. Formato PT-PT: "1 234,50 €".

export function formatEuros(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${euros},${String(abs % 100).padStart(2, '0')} €`;
}

// "12,5" | "12.50" | "12 €" → 1250 cêntimos; null se não for um valor válido (1 cêntimo a 1 000 000 €)
export function parseEuros(text: string): number | null {
  const clean = text.replace(/[€\s]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(parseFloat(clean) * 100);
  return cents > 0 && cents <= 100_000_000 ? cents : null;
}

// "1:30" | "1,5" (horas) | "45 min" → 90 | 90 | 45 minutos; null se inválido (máx. 31 dias)
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase();
  let minutes: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d+):(\d{1,2})$/))) {
    if (Number(m[2]) >= 60) return null;
    minutes = Number(m[1]) * 60 + Number(m[2]);
  } else if ((m = t.match(/^(\d+)\s*(min|m)$/))) {
    minutes = Number(m[1]);
  } else if (/^\d+([.,]\d{1,2})?$/.test(t)) {
    minutes = Math.round(parseFloat(t.replace(',', '.')) * 60);
  }
  return minutes !== null && minutes > 0 && minutes <= 44640 ? minutes : null;
}

// 150 → "2h 30min"; -45 → "-45min"
export function formatMinutes(total: number): string {
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}min`;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}min`;
}

// Data local AAAA-MM-DD (o fuso do telemóvel)
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
