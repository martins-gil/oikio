import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { LEGAL, type LegalSection } from '@/lib/legal';
import { colors, spacing } from '@/lib/theme';

// Documento legal (Termos, Política) em texto simples, legível e sem alturas fixas
export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text variant="title" style={styles.title}>{title}</Text>
      <Text variant="label" style={styles.muted}>Última atualização: {LEGAL.updated}</Text>
      {sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text variant="section" style={styles.heading}>{s.title}</Text>
          {s.paragraphs?.map((p, i) => (
            <Text key={i} variant="body" style={styles.text}>{p}</Text>
          ))}
          {s.bullets?.map((b, i) => (
            <View key={i} style={styles.bullet}>
              <Text variant="body" style={styles.dot}>•</Text>
              <Text variant="body" style={[styles.text, styles.flex]}>{b}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg * 2 },
  title: { color: colors.ink },
  muted: { color: colors.muted },
  section: { gap: 8, marginTop: spacing.xs },
  heading: { color: colors.ink },
  text: { color: colors.ink },
  bullet: { flexDirection: 'row', gap: 8 },
  dot: { color: colors.primary },
});
