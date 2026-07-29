import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// A browser can turn a blob URL + <a download> click straight into a
// Downloads-folder save — but Capacitor's native WebView has no download
// manager wired up for that at all, so the exact same click silently does
// nothing (confirmed live in the Android emulator: no error, no file,
// nothing). There's also no universal "Downloads" gesture on mobile the
// way there is in a desktop browser, so on native this writes the file to
// the app's cache dir and hands it to the OS share sheet instead — the
// standard Capacitor pattern for "let the user save/send a generated file."
export async function saveOrShareBlob(blob: Blob, filename: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const base64 = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ url: uri });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result is a "data:<mime>;base64,<payload>" URL —
      // Filesystem.writeFile wants just the base64 payload itself.
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
