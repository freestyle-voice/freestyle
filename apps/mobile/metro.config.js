// Learn more https://docs.expo.io/guides/customizing-metro
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname, {
  annotateReactComponents: true,
  includeWebReplay: false,
  includeWebFeedback: false,
});

module.exports = config;
