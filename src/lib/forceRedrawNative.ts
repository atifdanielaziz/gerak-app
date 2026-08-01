import { registerPlugin } from '@capacitor/core';

interface ForceRedrawPlugin {
  redraw(): Promise<void>;
}

// Matches the @CapacitorPlugin(name = "ForceRedraw") registration in
// android/app/src/main/java/com/gerakmy/app/ForceRedrawPlugin.java — a
// local plugin (no npm package), so this is the only place it's declared
// on the JS side. Only ever called from forceRepaint.ts, gated behind an
// isNativePlatform() + Android check — this plugin doesn't exist on
// web/iOS, calling it there would reject.
export const ForceRedraw = registerPlugin<ForceRedrawPlugin>('ForceRedraw');
