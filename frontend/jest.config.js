const esModules = [
  "react-native",
  "@react-native",
  "expo",
  "expo-asset",
  "expo-constants",
  "expo-file-system",
  "expo-font",
  "expo-linking",
  "expo-location",
  "expo-router",
  "expo-splash-screen",
  "expo-status-bar",
  "expo-system-ui",
  "expo-web-browser",
  "expo-modules-core",
  "@expo",
  "react-native-reanimated",
  "react-native-gesture-handler",
  "@react-navigation",
];

module.exports = {
  preset: "jest-expo",
  testMatch: [
    "<rootDir>/tests/**/*.test.ts",
    "<rootDir>/tests/**/*.test.tsx",
    "**/?(*.)+(spec|test).[tj]sx?",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns: [
    `node_modules/(?!(${esModules.join("|")})/)`,
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
};
