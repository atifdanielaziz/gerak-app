import { registerPlugin } from '@capacitor/core';

interface NativePrintPlugin {
  print(options: { html: string; jobName?: string }): Promise<void>;
}

// Matches the @CapacitorPlugin(name = "NativePrint") registration in
// android/app/src/main/java/com/gerakmy/app/NativePrintPlugin.java — a local
// plugin (no npm package), so this is the only place it's declared on the
// JS side. No-op on web/iOS; only ever called after an isNativePlatform()
// check (see receiptPdf.ts).
export const NativePrint = registerPlugin<NativePrintPlugin>('NativePrint');
