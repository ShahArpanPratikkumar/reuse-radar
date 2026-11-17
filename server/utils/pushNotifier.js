/**
 * Expo Push Notification Dispatcher
 * Sends push notifications using Expo's Push Gateway API
 */
const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  if (!expoPushToken || typeof expoPushToken !== 'string') {
    return false;
  }

  // Basic check for Expo push token format
  if (!expoPushToken.startsWith('ExponentPushToken[') && !expoPushToken.startsWith('ExpoPushToken[')) {
    console.log(`[Push Notification] Skipped: Invalid token format "${expoPushToken}"`);
    return false;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    priority: 'high',
    channelId: 'default',
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log(`[Push Notification] Sent successfully to ${expoPushToken}`, result);
    return true;
  } catch (error) {
    console.error(`[Push Notification] Error sending to ${expoPushToken}:`, error.message);
    return false;
  }
};

module.exports = { sendPushNotification };
