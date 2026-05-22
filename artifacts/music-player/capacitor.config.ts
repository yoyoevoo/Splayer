import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.splayer.app",
  appName: "Splayer",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
};

export default config;
