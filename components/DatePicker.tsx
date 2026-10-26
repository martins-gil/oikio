import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';

import { localDate } from '@/lib/money';
import { colors, radius } from '@/lib/theme';

type Props = {
  value: string | null; // AAAA-MM-DD
  onChange: (date: string) => void;
  min?: string; // por defeito, hoje
  max?: string; // por defeito, daqui a um ano
};

const WEEK = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

// Seletor de data sem dependências: atalhos (hoje, amanhã, daqui a uma semana) e um calendário do mês
export function DatePicker({ value, onChange, min, max }: Props) {
  const today = localDate();
  const lo = min ?? today;
  const hi = max ?? addDays(today, 365);
  const start = parse(value ?? lo);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // segunda = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => localDate(new Date(year, month, i + 1))),
  ];

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };
  const canPrev = localDate(new Date(year, month, 0)) >= lo;
  const canNext = localDate(new Date(year, month + 1, 1)) <= hi;

  const quick = [
    { label: 'Hoje', date: today },
    { label: 'Amanhã', date: addDays(today, 1) },
    { label: 'Daqui a 1 semana', date: addDays(today, 7) },
  ].filter((q) => q.date >= lo && q.date <= hi);

  const pick = (date: string) => {
    onChange(date);
    const d = parse(date);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <View style={styles.box}>
      <View style={styles.quick}>
        {quick.map((q) => (
          <Pressable key={q.label} style={[styles.chip, value === q.date && styles.chipOn]} onPress={() => pick(q.date)}>
            <Text style={[styles.chipText, value === q.date && styles.chipTextOn]}>{q.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.monthRow}>
        <Pressable hitSlop={12} disabled={!canPrev} onPress={() => shift(-1)}>
          <Text style={[styles.arrow, !canPrev && styles.off]}>◀</Text>
        </Pressable>
        <Text style={styles.month}>
          {MONTHS[month]} {year}
        </Text>
        <Pressable hitSlop={12} disabled={!canNext} onPress={() => shift(1)}>
          <Text style={[styles.arrow, !canNext && styles.off]}>▶</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEK.map((w, i) => (
          <Text key={`w${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={styles.cell} />;
          const disabled = date < lo || date > hi;
          const selected = date === value;
          return (
            <Pressable key={date} style={styles.cell} disabled={disabled} onPress={() => pick(date)}>
              <View style={[styles.day, selected && styles.daySelected, date === today && !selected && styles.dayToday]}>
                <Text style={[styles.dayText, disabled && styles.off, selected && styles.dayTextSelected]}>{Number(date.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, backgroundColor: colors.primary, borderRadius: radius.card, padding: 14 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.lavender, borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.pink, borderColor: colors.pink },
  chipText: { color: colors.lavender },
  chipTextOn: { color: colors.white },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  arrow: { fontSize: 18, color: colors.accent },
  off: { opacity: 0.25 },
  month: { fontSize: 18, color: colors.white, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.lavender, fontSize: 12, marginBottom: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.accent },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { fontSize: 15, color: colors.white },
  dayTextSelected: { color: colors.ink },
});
