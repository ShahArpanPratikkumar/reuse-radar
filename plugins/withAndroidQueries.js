const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to add Android 11+ <queries> intents for Phone Dialer (tel),
 * WhatsApp (whatsapp), Email (mailto), and Maps (geo) so Linking.openURL works
 * reliably across all Android devices.
 */
module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (conf) => {
    const manifest = conf.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [{}];
    }
    const queryBlock = manifest.queries[0];
    if (!queryBlock.intent) {
      queryBlock.intent = [];
    }

    const schemesToAdd = ['tel', 'whatsapp', 'mailto', 'geo'];
    schemesToAdd.forEach((scheme) => {
      const exists = queryBlock.intent.some((item) =>
        item?.data?.some((d) => d?.$?.['android:scheme'] === scheme)
      );
      if (!exists) {
        queryBlock.intent.push({
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          data: [{ $: { 'android:scheme': scheme } }],
        });
      }
    });

    // Also allow ACTION_DIAL for tel:
    const hasDial = queryBlock.intent.some(
      (item) => item?.action?.[0]?.$?.['android:name'] === 'android.intent.action.DIAL'
    );
    if (!hasDial) {
      queryBlock.intent.push({
        action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
        data: [{ $: { 'android:scheme': 'tel' } }],
      });
    }

    return conf;
  });
};
