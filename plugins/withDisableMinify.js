const { withGradleProperties } = require('@expo/config-plugins');
const { updateAndroidBuildProperty } = require('@expo/config-plugins').AndroidConfig.BuildProperties;

/**
 * Expo Config Plugin to disable R8 code minification in release builds.
 * This prevents R8 from stripping androidx.work.impl.WorkDatabase and reflection classes,
 * which causes the fatal crash:
 * "Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName"
 */
module.exports = function withDisableMinify(config) {
  return withGradleProperties(config, (conf) => {
    conf.modResults = updateAndroidBuildProperty(
      conf.modResults,
      'android.enableMinifyInReleaseBuilds',
      'false'
    );
    return conf;
  });
};
