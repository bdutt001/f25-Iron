// Minimal env typings for Expo public vars in React Native
declare const __DEV__: boolean;

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

