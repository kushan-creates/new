import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

/**
 * Cross-platform PDF export.
 * - Web: opens a new tab with the HTML and triggers the browser's print dialog
 *   (users get "Save as PDF" from the print dialog).
 * - Native: uses expo-print + expo-sharing.
 */
export async function exportPdfCrossPlatform(html: string, filename = 'report'): Promise<void> {
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Pop-up blocked — please allow pop-ups for this site');
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give the browser time to render before calling print
    setTimeout(() => {
      try { w.focus(); w.print(); } catch { /* ignore */ }
    }, 400);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: filename });
  }
}

/**
 * Cross-platform CSV export.
 * - Web: builds a data URL and triggers a download via <a download>.
 * - Native: writes to cache dir and opens the share sheet.
 */
export async function exportCsvCrossPlatform(csv: string, filename = 'report'): Promise<void> {
  const name = `${filename}-${Date.now()}.csv`;
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const fileUri = (FileSystem.cacheDirectory || '') + name;
  await FileSystem.writeAsStringAsync(fileUri, csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: name });
  }
}
