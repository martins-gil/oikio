// Contas do gráfico em arco (ProgressArc): pontos ao longo de um arco aberto em baixo e cor ao longo de um gradiente.
// Lógica pura, sem React, para se poder testar.
export type ArcDot = { x: number; y: number; f: number }; // f: posição no arco, de 0 (início) a 1 (fim)

// `startDeg`/`sweepDeg` em graus, no sentido dos ponteiros, com 0° à direita (y para baixo, como no ecrã).
// 150° + 240° vai da esquerda-em-baixo, por cima, até à direita-em-baixo.
export function arcDots(n: number, r: number, cx: number, cy: number, startDeg = 150, sweepDeg = 240): ArcDot[] {
  return Array.from({ length: n }, (_, i) => {
    const f = n === 1 ? 0 : i / (n - 1);
    const a = ((startDeg + sweepDeg * f) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), f };
  });
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

// Cor no ponto f (0..1) de um gradiente com paragens igualmente espaçadas (cores #RRGGBB)
export function gradientAt(stops: string[], f: number): string {
  if (stops.length === 1) return stops[0];
  const x = Math.min(1, Math.max(0, f)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const t = x - i;
  const a = rgb(stops[i]);
  const b = rgb(stops[i + 1]);
  return `#${[0, 1, 2].map((k) => hex2(a[k] + (b[k] - a[k]) * t)).join('')}`;
}

// Quantos pontos ficam acesos para uma percentagem (pelo menos 1 se já há progresso)
export function filledDots(percent: number, n: number): number {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return p === 0 ? 0 : Math.max(1, Math.round(p * n));
}
