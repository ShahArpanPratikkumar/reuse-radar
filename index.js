import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import App from './App';

// Keep native splash screen visible until we explicitly hide it in RootNavigator
SplashScreen.preventAutoHideAsync().catch(() => {});

registerRootComponent(App);
