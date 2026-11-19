// =============================================================================
// REUSE RADAR - AUTH NAVIGATOR (AuthNavigator.jsx)
// Purpose: Manages the navigation flow for unauthenticated users.
//          Shown by RootNavigator when isAuthenticated=false (no valid JWT).
// Flow:
//   Welcome Screen → (Sign In) → Login Screen
//   Welcome Screen → (Sign Up) → Register Screen
// Features:
//   1. No header shown (Welcome, Login, Register all have custom designs)
//   2. Smooth right-to-left slide transition between auth screens
//   3. Mint green background color during screen transitions
//   4. When user logs in successfully, AuthContext sets isAuthenticated=true
//      and RootNavigator automatically switches to MainNavigator (no navigate() needed)
// =============================================================================

// React core
import React from 'react';

// createNativeStackNavigator: provides native iOS/Android slide transitions
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// The three screens in the auth flow
import WelcomeScreen from '../screens/WelcomeScreen';   // Landing screen with app intro
import LoginScreen from '../screens/LoginScreen';        // Email + password login form
import RegisterScreen from '../screens/RegisterScreen';  // New account registration form

// Create the stack navigator instance for the auth flow
const Stack = createNativeStackNavigator();

// =============================================================================
// AuthNavigator Component
// A simple 3-screen stack. Users start at Welcome and can navigate to
// Login or Register. After successful auth, RootNavigator takes over.
// =============================================================================

// Auth flow: Welcome → Login  OR  Welcome → Register
const AuthNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Welcome" // Always start at the Welcome screen
      screenOptions={{
        headerShown: false,            // All auth screens have custom headers/designs
        animation: 'slide_from_right', // Native iOS/Android right-to-left slide animation
        contentStyle: { backgroundColor: '#F0FDF4' }, // Mint background during transitions
        // This prevents the white flash between screens when navigating
      }}
    >
      {/* Welcome Screen — Branding, feature highlights, Get Started / Sign In buttons */}
      <Stack.Screen name="Welcome" component={WelcomeScreen} />

      {/* Login Screen — Email + password form, links back to Register */}
      <Stack.Screen name="Login" component={LoginScreen} />

      {/* Register Screen — Full registration form with phone + location */}
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
};

// AuthNavigator is imported and used by RootNavigator
export default AuthNavigator;
