import type { CapacitorConfig } from "@capacitor/cli";

// iOS wrapper: loads the live site so web publishes update the app without resubmitting.
const config: CapacitorConfig = {
  appId: "com.syllabusstudy.app",
  appName: "SyllabusStudy",
  webDir: "ios-shell",
  backgroundColor: "#0F1117",
  server: {
    url: "https://syllabusstudy.com/dashboard?source=ios",
    allowNavigation: ["syllabusstudy.com", "*.syllabusstudy.com", "accounts.google.com"],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0F1117",
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
