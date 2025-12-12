module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // expo-router/babel deprecated in SDK 50; babel-preset-expo handles routing transforms.
    plugins: ["react-native-reanimated/plugin"],
  };
};
