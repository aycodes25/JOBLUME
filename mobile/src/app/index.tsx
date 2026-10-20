import { canonicalJobUrl } from '@joblume/shared';
import { Text, View } from 'react-native';
import { colors } from '@/theme';

export default function Index() {
  const link = canonicalJobUrl('https://www.linkedin.com/jobs/view/4012345678/?trk=x');
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <Text>{link ? 'JobLume' : 'Shared package missing'}</Text>
    </View>
  );
}
