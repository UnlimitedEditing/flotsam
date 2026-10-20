import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

// Typed view of the Kotlin plugin in android/app/src/main/java/app/flotsam/client/FlotsamNativePlugin.kt.

export interface NativeResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface StreamLine {
  id: string
  line: string
}

export interface StreamEnd {
  id: string
  status: number
  error: string
  body: string
}

export interface SharedImage {
  name: string
  mime: string
  base64: string
}

export type NativeUpdateDecision = 'none' | 'up_to_date' | 'available' | 'forced'

export interface NativeUpdateState {
  enabled: boolean
  installedCode: number
  installedName: string
  lastCheck: number
  checked: boolean
  decision: NativeUpdateDecision
  error: string
  manifest?: { versionCode: number; versionName: string; notes: string; size: number }
}

export type NativePermission = 'granted' | 'denied' | 'prompt'

export interface FlotsamNativePlugin {
  getApiKey(): Promise<{ value: string }>
  setApiKey(o: { value: string }): Promise<void>
  setFlags(o: { consent?: boolean }): Promise<void>
  clearAll(): Promise<void>

  watchRender(o: { jobId: string; renderHash: string }): Promise<void>
  unwatchRender(o: { jobId: string }): Promise<void>

  request(o: {
    method?: string
    url: string
    headers?: Record<string, string>
    body?: string
  }): Promise<NativeResponse>
  stream(o: {
    id: string
    jobId?: string
    method?: string
    url: string
    headers?: Record<string, string>
    body?: string
  }): Promise<void>
  cancelStream(o: { id: string }): Promise<void>
  upload(o: {
    url: string
    fields?: Record<string, string>
    fileBase64: string
    fileName: string
    mime: string
    fileField: string
  }): Promise<{ status: number; body: string }>

  biometricAvailable(): Promise<{ available: boolean }>
  biometricAuth(o: { title?: string }): Promise<{ success: boolean; error?: string }>
  setSecure(o: { enabled: boolean }): Promise<void>
  saveToGallery(o: { url?: string; base64?: string; name: string; mime: string }): Promise<{ uri: string }>

  notificationState(): Promise<{ state: NativePermission }>
  requestNotificationPermission(): Promise<{ state: NativePermission }>
  notify(o: { jobId: string; ok: boolean }): Promise<void>
  setDiscreet(o: { enabled: boolean }): Promise<void>

  updateStatus(): Promise<NativeUpdateState>
  updateCheck(o: { auto?: boolean }): Promise<NativeUpdateState>
  updateDownload(): Promise<{ ready: boolean; size: number }>
  updateInstall(): Promise<{ started?: boolean; needsPermission?: boolean }>
  updateOpenInstallSettings(): Promise<void>

  sharedCount(): Promise<{ count: number }>
  takeShared(): Promise<{ images: SharedImage[] }>

  addListener(event: 'streamLine', fn: (e: StreamLine) => void): Promise<PluginListenerHandle>
  addListener(event: 'streamEnd', fn: (e: StreamEnd) => void): Promise<PluginListenerHandle>
  addListener(
    event: 'updateProgress',
    fn: (e: { done: number; total: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(event: 'updateFailed', fn: (e: { message: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'shareReceived', fn: (e: { count: number }) => void): Promise<PluginListenerHandle>
}

export const FlotsamNative = registerPlugin<FlotsamNativePlugin>('FlotsamNative')
