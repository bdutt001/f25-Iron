const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;
const testSuite = process.env.TEST_SUITE === "integration" ? "integration" : "unit";

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch:
    testSuite === "integration"
      ? ["**/integration/**/*.test.ts"]
      : ["**/unit/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json", "node"],
  transform: {
    ...tsJestTransformCfg,
  },
  clearMocks: true,
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.ts"],
  verbose: false,
};
