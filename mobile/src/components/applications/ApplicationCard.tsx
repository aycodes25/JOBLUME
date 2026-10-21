import type { Application } from '@joblume/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { scoreTone } from '@/lib/applications';
import { postedLabel, sourceLabel, STATUS_LABELS } from '@/lib/format';
import { colors, font, radius, space } from '@/theme';

const MAX_KEYWORDS = 2;
const MATCH_TONE = { high: 'success', mid: 'warning', low: 'danger', none: 'secondary' } as const;

/** A queue card as in the mobile home mockup: initial tile, title, company, match badge, place, time, source, keywords, Details. */
export function ApplicationCard({ app, onOpen, now }: { app: Application; onOpen(id: string): void; now?: Date }) {
  const title = app.job?.title ?? 'Untitled role';
  const company = app.job?.company ?? 'Unknown company';
  const keywords = app.missing_keywords.slice(0, MAX_KEYWORDS);
  const extra = app.missing_keywords.length - keywords.length;
  const posted = postedLabel(app.created_at, app.job?.posted_at, now);

  return (
    <Card>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>{company.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.titles}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.company}>{company}</Text>
        </View>
        <Badge label={app.match_score === null ? 'NO SCORE' : `${app.match_score}% MATCH`} tone={MATCH_TONE[scoreTone(app.match_score)]} />
      </View>

      <View style={styles.meta}>
        {app.job?.location ? <Text style={styles.metaText}>{app.job.location}</Text> : null}
        {posted ? <Text style={styles.metaText}>{posted}</Text> : null}
        {app.job ? <Badge label={sourceLabel(app.job.source)} tone="outline" /> : null}
        {app.status !== 'pending_review' ? <Badge label={STATUS_LABELS[app.status]} tone={app.status === 'approved' ? 'primary' : 'secondary'} /> : null}
      </View>

      <View style={styles.bottom}>
        <View accessibilityLabel="Missing keywords" style={styles.keywords}>
          {keywords.map((k) => (
            <Badge key={k} label={k} tone="warning" />
          ))}
          {extra > 0 ? <Text style={styles.metaText}>{`+${extra}`}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Details for ${title}`} onPress={() => onOpen(app.id)} hitSlop={8}>
          <Text style={styles.details}>Details ›</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space(3) },
  logo: { width: 44, height: 44, borderRadius: radius.input, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: font.heading, fontWeight: '700', color: colors.primary },
  titles: { flex: 1, gap: 2 },
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  company: { fontSize: font.small, color: colors.muted },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(3) },
  metaText: { fontSize: font.small, color: colors.muted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space(3) },
  keywords: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space(1.5), flex: 1 },
  details: { fontSize: font.body, color: colors.primary, fontWeight: '600' },
});
