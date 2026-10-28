import type { CapacitorConfig } from "@capacitor/cli";

// iOS wrapper: loads the live site so web publishes update the app without resubmitting.
const config: CapacitorConfig = {
  appId: "com.syllabusstudy.app",
  appName: "SyllabusStudy",
  webDir: "ios-shell",
  backgroundColor: "#0F1117",
  server: {
    url: "https://syllabusstudy.com/dashboard?source=ios",
    // Keep sign-in inside the app (Apple guideline 4): the sign-in broker and Apple's sign-in page must not open Safari.
    allowNavigation: [
      "syllabusstudy.com",
      "*.syllabusstudy.com",
      "oauth.lovable.app",
      "*.lovable.app",
      "appleid.apple.com",
      "*.apple.com",
      "*.supabase.co",
    ],
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0F1117",
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
