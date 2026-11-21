// MUST be at the very top before any other imports for React Navigation gesture handling on Android
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import App from './App';

// Keep native splash screen visible until we explicitly hide it in RootNavigator or ErrorBoundary
SplashScreen.preventAutoHideAsync().catch(() => {});

registerRootComponent(App);
