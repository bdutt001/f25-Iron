import "@testing-library/jest-native/extend-expect";
import "react-native-gesture-handler/jestSetup";

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

global.__reanimatedWorkletInit = () => {};

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  router: mockRouter,
}));

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  if (typeof global.fetch !== "function") {
    global.fetch = jest.fn();
  }
});

afterEach(() => {
  (console.warn as jest.Mock | undefined)?.mockRestore?.();
  (console.error as jest.Mock | undefined)?.mockRestore?.();
});
