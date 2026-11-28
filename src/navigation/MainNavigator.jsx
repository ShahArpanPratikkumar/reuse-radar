// =============================================================================
// REUSE RADAR - MAIN NAVIGATOR (MainNavigator.jsx)
// Purpose: Defines the app's navigation structure for authenticated users.
//          Two-layer architecture:
//            1. Bottom Tab Navigator (TabNavigator) — 5 main tabs
//            2. Stack Navigator (MainNavigator)     — screens pushed on top of tabs
// Features:
//   1. Custom center "+" button for quick item listing (Stitch design)
//   2. Unread notification badge on Profile tab
//   3. Stack screens for all detail/modal views (ItemDetails, Chat, EditProfile, etc.)
//   4. AddItem registered in BOTH Tab and Stack (fixes 'AddItem not handled' error)
//   5. Stitch design system colors: Forest Green #064E3B, Lime #A3E635
// =============================================================================

// React core
import React, { useContext } from 'react';

// React Native UI components
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

// Vector icons for professional tab bar
import { Ionicons } from '@expo/vector-icons';

// React Navigation — Stack navigator for sequential screens (push/pop)
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// React Navigation — Bottom tab navigator (the main tab bar at the bottom)
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// ── Screen imports ─────────────────────────────────────────────────────────────
// All screens that can be navigated to from the main app
import HomeScreen from '../screens/HomeScreen';
import ExploreScreen from '../screens/ExploreScreen';
import AddItemScreen from '../screens/AddItemScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ItemDetailsScreen from '../screens/ItemDetailsScreen';
import MyItemsScreen from '../screens/MyItemsScreen';
import RequestsScreen from '../screens/RequestsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import AdminModerationScreen from '../screens/AdminModerationScreen';
import ChatScreen from '../screens/ChatScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import RequestItemScreen from '../screens/RequestItemScreen';
import MessagesListScreen from '../screens/MessagesListScreen';
import UserProfileScreen from '../screens/UserProfileScreen';

// AuthContext provides unreadNotifCount for the notification badge
import { AuthContext } from '../context/AuthContext';

// COLORS provides the design system color palette
import { COLORS } from '../utils/constants';

// Create navigator instances
const Stack = createNativeStackNavigator(); // For detail screens (push/pop)
const Tab = createBottomTabNavigator();     // For the bottom 5-tab bar

// =============================================================================
// Custom Center Tab Button (Stitch Design)
// The "+" button in the middle of the tab bar is a special elevated circular button.
// It floats above the tab bar using negative top margin.
// This matches the Stitch design spec for the "Give Away / List Item" primary action.
// =============================================================================

const CustomTabBarButton = ({ children, onPress }) => (
  <TouchableOpacity
    style={styles.customButtonContainer} // Elevated container that sits above the tab bar
    onPress={onPress}                    // Opens AddItemScreen when pressed
    activeOpacity={0.85}                 // Slight fade on press (better than full 1.0)
  >
    <View style={styles.centerAddBtn}>   {/* Circular green button */}
      <Text style={styles.centerAddBtnText}>＋</Text>  {/* Large plus symbol */}
    </View>
  </TouchableOpacity>
);

// =============================================================================
// TabNavigator — The 5-tab bottom navigation bar
// Tab order (left to right): Home, Explore, [+ Give], Requests, Profile
// =============================================================================

const TabNavigator = () => {
  // Get live unread notification count from AuthContext (refreshed every 30 seconds)
  const { unreadNotifCount } = useContext(AuthContext);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,                   // Each screen manages its own header
        tabBarActiveTintColor: '#064E3B',     // Active tab: Forest Green
        tabBarInactiveTintColor: '#64748B',   // Inactive tab: Slate Gray
        tabBarStyle: {
          backgroundColor: '#FFFFFF',         // White tab bar background
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',          // Light border at top
          height: 64,                         // Slightly taller for comfort
          paddingBottom: 8,
          paddingTop: 8,
          // Shadow for the tab bar (iOS)
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 6,
          elevation: 8,                       // Shadow for Android
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: -2, // Bring label closer to icon
        },
      }}
    >
      {/* Tab 1: Home — The main feed of nearby available items */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Tab 2: Explore — Radar map view for discovering items by location */}
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'search-circle' : 'search-circle-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* Tab 3: Center "+" Give Button — Opens AddItemScreen to list a new item */}
      {/* This tab uses the custom circular button instead of a regular tab icon */}
      <Tab.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{
          tabBarLabel: () => null, // No label below the center button (by design)
          // Replace the default tab button with our custom elevated circular button
          tabBarButton: (props) => <CustomTabBarButton {...props} />,
        }}
      />

      {/* Tab 4: Requests — View sent and received item exchange requests */}
      <Tab.Screen
        name="Requests"
        component={RequestsScreen}
        options={{
          tabBarLabel: 'Requests',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'swap-horizontal' : 'swap-horizontal-outline'}
              size={22}
              color={color}
            />
          ),
        }}
      />

      {/* Tab 5: Profile — User profile, stats, eco impact, settings */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// =============================================================================
// MainNavigator — The Stack Navigator that wraps the TabNavigator
// Stack screens are pushed on top of the tab navigator when navigating to details.
// navigation.navigate('ItemDetails', { item }) pushes ItemDetailsScreen over tabs.
// When user presses Back, the tab view is restored.
// =============================================================================

const MainNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,              // Most screens have custom headers
        animation: 'slide_from_right',   // Standard slide transition between screens
      }}
    >
      {/* The first screen is always the tab navigator (all 5 tabs) */}
      <Stack.Screen name="MainTabs" component={TabNavigator} />

      {/* Item detail view — opened when user taps a listing card */}
      <Stack.Screen
        name="ItemDetails"
        component={ItemDetailsScreen}
        options={{
          headerShown: false, // ItemDetailsScreen has a custom Stitch-design header
        }}
      />

      {/* Notification list — opened from Profile screen bell icon */}
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: true,
          title: 'Notifications',
          headerBackTitle: 'Back',
          headerTintColor: '#064E3B',           // Forest Green back arrow
          headerStyle: { backgroundColor: '#F0FDF4' }, // Mint background header
        }}
      />

      {/* My listings and requests — opened from Profile screen */}
      <Stack.Screen
        name="MyItems"
        component={MyItemsScreen}
        options={{
          headerShown: true,
          title: 'My Items & Requests',
          headerBackTitle: 'Back',
          headerTintColor: '#064E3B',
          headerStyle: { backgroundColor: '#F0FDF4' },
        }}
      />

      {/* Favorites/bookmarks list */}
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ headerShown: false }}
      />

      {/* Admin content moderation dashboard (admin role only) */}
      <Stack.Screen
        name="AdminModeration"
        component={AdminModerationScreen}
        options={{ headerShown: false }}
      />

      {/* Edit profile screen — opened from ProfileScreen */}
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />

      {/* Send a request for a specific item — opened from ItemDetailsScreen */}
      <Stack.Screen
        name="RequestItem"
        component={RequestItemScreen}
        options={{ headerShown: false }}
      />

      {/* Inbox/conversation list */}
      <Stack.Screen
        name="Messages"
        component={MessagesListScreen}
        options={{ headerShown: false }}
      />

      {/* View another student's public trust profile */}
      <Stack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{ headerShown: false }}
      />

      {/* Individual chat screen for messaging about a specific item */}
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: false }}
      />

      {/* AddItem is ALSO registered here in the Stack (not just in Tabs above).
          This is REQUIRED because:
          - navigation.navigate('AddItem', { itemToEdit: ... }) from MyItemsScreen
            triggers a Stack navigation, not a Tab navigation.
          - Without this Stack.Screen, React Navigation throws:
            "The action 'NAVIGATE' with payload {name:'AddItem'} was not handled"
          - Having it in BOTH Tab and Stack is intentional and correct. */}
      <Stack.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};

// =============================================================================
// Styles — Stitch Design System for the custom center tab button
// =============================================================================

const styles = StyleSheet.create({
  customButtonContainer: {
    top: -16,            // Lifts the button above the tab bar (floating effect)
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerAddBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,          // Perfect circle (width/2)
    backgroundColor: '#064E3B', // Forest Green — primary brand color
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',    // White ring around the button (stands out from tab bar)
    // Shadow (iOS)
    shadowColor: '#064E3B',    // Green shadow matches button color
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,              // Shadow (Android)
  },
  centerAddBtnText: {
    color: '#A3E635',          // Stitch Lime accent — the "+" symbol color
    fontSize: 26,
    fontWeight: '900',         // Extra bold for visual prominence
    lineHeight: 28,            // Vertically centers the "+" symbol in the button
  },
});

// Export MainNavigator as the default export
// RootNavigator imports and uses this when isAuthenticated=true
export default MainNavigator;
