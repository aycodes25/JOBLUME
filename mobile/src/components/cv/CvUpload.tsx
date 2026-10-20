import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Message } from '@/components/ui/States';
import { describeApiError } from '@/lib/api/errors';
import { CV_MIME_TYPES, toCvFile, validateCvAsset, type CvFile } from '@/lib/cv-file';
import { colors, font, radius, space } from '@/theme';

export interface PickedDocument {
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}

/** Opens the system file picker for a PDF or DOCX. Null when the user cancels. */
export async function pickCvDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: CV_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  return result.assets[0] ?? null;
}

export interface CvUploadProps {
  onUpload(file: CvFile): Promise<void>;
  currentName?: string | null;
  pick?: () => Promise<PickedDocument | null>;
}

/** Choose a CV with the document picker, check it like the web does, then upload it. */
export function CvUpload({ onUpload, currentName, pick = pickCvDocument }: CvUploadProps) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    if (status === 'uploading') return;
    let asset: PickedDocument | null;
    try {
      asset = await pick();
    } catch {
      setError('Could not open your files. Please try again.');
      return;
    }
    if (!asset) return;
    const problem = validateCvAsset(asset);
    if (problem) {
      setError(problem);
      setStatus('idle');
      return;
    }
    setError(null);
    setStatus('uploading');
    try {
      await onUpload(toCvFile(asset));
      setStatus('done');
    } catch (err) {
      setError(describeApiError(err));
      setStatus('idle');
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.drop}>
        <Text style={styles.strong}>{status === 'uploading' ? 'Uploading…' : 'Upload your CV'}</Text>
        <Text style={styles.muted}>PDF or DOCX, up to 5 MB, with selectable text</Text>
        <Button label={status === 'uploading' ? 'Uploading…' : 'Choose your CV'} onPress={() => void choose()} disabled={status === 'uploading'} />
      </View>
      {currentName ? <Text style={styles.muted}>{`Current CV: ${currentName}`}</Text> : null}
      {status === 'done' ? <Message kind="success" text="CV uploaded." /> : null}
      {error ? <Message kind="error" text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space(3) },
  drop: { alignItems: 'center', gap: space(2), borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.card, padding: space(6), backgroundColor: colors.card },
  strong: { fontSize: font.body, fontWeight: '600', color: colors.text },
  muted: { fontSize: font.small, color: colors.muted, textAlign: 'center' },
});
