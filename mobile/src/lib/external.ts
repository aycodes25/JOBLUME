import { safeHttpUrl } from '@joblume/shared';
import { Linking } from 'react-native';

/** Opens a link in the phone's browser only when it is http(s). Returns false (and opens nothing) otherwise. */
export async function openExternalUrl(raw: unknown, open: (url: string) => Promise<unknown> = (url) => Linking.openURL(url)): Promise<boolean> {
  const url = safeHttpUrl(raw);
  if (!url) return false;
  await open(url);
  return true;
}
