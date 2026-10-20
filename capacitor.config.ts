import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.flotsam.client',
  appName: 'Flotsam',
  webDir: 'dist-android',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: {
    StatusBar: { style: 'DARK', backgroundColor: '#0e1113' },
  },
}

export default config
