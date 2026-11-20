// =============================================================================
// REUSE RADAR - ADD ITEM SCREEN (AddItemScreen.jsx)
// Purpose: Multi-photo item creation & editing form with native Camera & GPS location tagging.
// Features:
// 1. Native Camera integration: launches phone's default camera app via expo-image-picker.
// 2. Multi-image strip with cover photo badge and gallery picker fallback (up to 5 photos).
// 3. Native GPS detection with reverse geocoding via expo-location (accuracy reporting).
// 4. Listing types: Free Giveaway ('donation'), Paid marketplace ('sell'), or Borrow ('borrow' with term).
// 5. Multipart FormData upload with automatic image MIME mapping and validation.
// =============================================================================

import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';

// Service layer communicating with /api/items endpoints
import { itemService } from '../services/itemService';
import { AuthContext } from '../context/AuthContext';
import { COLORS, CATEGORIES, CONDITIONS } from '../utils/constants';
import { getImageBaseUrl } from '../services/apiConfig';

const IMAGE_BASE_URL = getImageBaseUrl();
const MAX_PHOTOS = 5;

// Helper: Resolves backend photo path to full displayable URL
const resolvePhotoUri = (path) => {
  if (!path || typeof path !== 'string') return null;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return `${IMAGE_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

// Lending term options for temporary borrow listings
const BORROW_DURATIONS = [
  { label: '2 Days', days: 2 },
  { label: '5 Days', days: 5 },
  { label: '1 Week', days: 7 },
  { label: 'End of Semester', days: 120 },
];

const AddItemScreen = ({ route, navigation }) => {
  const { user } = useContext(AuthContext);

  // Check if screen was opened in edit mode with existing item payload
  const itemToEdit = route.params?.itemToEdit || route.params?.item;
  const isEditing = !!itemToEdit;

  // Form input field state hooks
  const [title, setTitle] = useState(itemToEdit?.title || '');
  const [description, setDescription] = useState(itemToEdit?.description || '');
  const [category, setCategory] = useState(itemToEdit?.category || 'Books');
  const [condition, setCondition] = useState(itemToEdit?.condition || 'Good');
  const [listingType, setListingType] = useState(itemToEdit?.listingType || 'donation');
  const [borrowDays, setBorrowDays] = useState(itemToEdit?.borrowDays || 7);
  const [price, setPrice] = useState(
    itemToEdit?.price ? String(itemToEdit.price) : ''
  );
  const [addressText, setAddressText] = useState(itemToEdit?.addressText || '');
  const [coordinates, setCoordinates] = useState(
    itemToEdit?.location?.coordinates || null
  );

  // Multi-image selection state array (up to MAX_PHOTOS = 5)
  const [selectedImages, setSelectedImages] = useState(() => {
    if (Array.isArray(itemToEdit?.images) && itemToEdit.images.length > 0) {
      return itemToEdit.images.slice(0, MAX_PHOTOS).map((path) => ({
        uri: resolvePhotoUri(path),
        isExisting: true,
        rawPath: path,
      }));
    }
    return [];
  });

  // Mechanism 1: Remove an attached image from the selection strip
  const removeSelectedImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const [submitting, setSubmitting] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // NATIVE FEATURE 1: DEVICE CAMERA INTEGRATION (expo-image-picker)
  // ───────────────────────────────────────────────────────────────────────────
  const [launchingCamera, setLaunchingCamera] = useState(false);

  // Mechanism 2: Launches the device native camera hardware application
  const handleOpenNativeCamera = async () => {
    if (launchingCamera) return;
    if (selectedImages.length >= MAX_PHOTOS) {
      Alert.alert('Photo Limit Reached', `You can attach up to ${MAX_PHOTOS} photos per listing.`);
      return;
    }
    setLaunchingCamera(true);
    try {
      // Step A: Request OS camera hardware permission
      const perm = await ImagePicker.requestCameraPermissionsAsync();

      if (!perm || perm.status !== 'granted') {
        if (perm && perm.canAskAgain === false) {
          Alert.alert(
            'Camera Permission Blocked',
            'Camera access has been disabled in device settings. Please enable camera access in App Settings to take photos of reusable items.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert(
            'Camera Permission Required',
            'ReUse Radar requires camera permission to photograph reusable items on your campus.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Grant Permission', onPress: handleOpenNativeCamera },
            ]
          );
        }
        return;
      }

      // Step B: Hand over control to native device camera app
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

      // Step C: If photo was snapped and confirmed, append to selectedImages
      if (result && !result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImages((prev) =>
          [...prev, ...result.assets.map((asset) => ({ ...asset, isExisting: false }))].slice(
            0,
            MAX_PHOTOS
          )
        );
        return;
      }

      // Step D: If user cancelled native camera, prompt for gallery selection
      Alert.alert(
        'No Photo Taken',
        'Want to pick a photo from your gallery instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose from Gallery', onPress: pickFromGallery },
        ]
      );
    } catch (err) {
      console.log('[Native Camera Error]', err);
      Alert.alert(
        'Camera Unavailable',
        err?.message ||
          'Could not open the camera on this device. You can pick a photo from your gallery instead.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose from Gallery', onPress: pickFromGallery },
        ]
      );
    } finally {
      setLaunchingCamera(false);
    }
  };

  // Mechanism 3: Choose from Media Library / Photo Gallery
  const pickFromGallery = async () => {
    try {
      if (selectedImages.length >= MAX_PHOTOS) {
        Alert.alert('Photo Limit Reached', `You can attach up to ${MAX_PHOTOS} photos per listing.`);
        return;
      }

      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Gallery Permission Required',
          'Gallery access is required to choose photos.',
          canAskAgain
            ? [{ text: 'Cancel' }, { text: 'Retry', onPress: pickFromGallery }]
            : [{ text: 'Cancel' }, { text: 'Settings', onPress: () => Linking.openSettings() }]
        );
        return;
      }

      const remainingSlots = MAX_PHOTOS - selectedImages.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedImages((prev) =>
          [
            ...prev,
            ...result.assets.slice(0, remainingSlots).map((asset) => ({
              ...asset,
              isExisting: false,
            })),
          ].slice(0, MAX_PHOTOS)
        );
      }
    } catch (err) {
      Alert.alert('Gallery Error', err.message || 'Failed to select image.');
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // NATIVE FEATURE 2: GPS LOCATION & REVERSE GEOCODING (expo-location)
  // ───────────────────────────────────────────────────────────────────────────
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationError, setLocationError] = useState('');
  const [accuracyText, setAccuracyText] = useState('');

  // Mechanism 4: Detect Live Hardware GPS Coordinates
  const detectLocation = async () => {
    setLocationStatus('loading');
    setLocationError('');
    try {
      // Step 1: Ensure device location hardware is toggled ON
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationStatus('disabled');
        setLocationError('Device GPS is turned off.');
        Alert.alert(
          'GPS Disabled',
          'Please turn on your device Location / GPS to auto-tag your pickup spot.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      // Step 2: Request foreground location permission
      let { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        status = req.status;
        canAskAgain = req.canAskAgain;
      }

      if (status !== 'granted') {
        setLocationStatus('denied');
        setLocationError('Location permission denied.');
        Alert.alert(
          'Location Permission Required',
          'ReUse Radar needs location permission to show your reusable item to nearby campus students accurately without faking coordinates.',
          canAskAgain
            ? [{ text: 'Cancel', style: 'cancel' }, { text: 'Retry', onPress: detectLocation }]
            : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]
        );
        return;
      }

      // Step 3: Acquire real GPS coordinates from hardware sensor
      let loc;
      try {
        loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch (gpsErr) {
        // Fallback to last known position if active satellite lock is slow
        loc = await Location.getLastKnownPositionAsync();
      }

      if (!loc || !loc.coords) {
        throw new Error('Unable to acquire GPS coordinates. Please check your signal.');
      }

      const { latitude, longitude, accuracy } = loc.coords;
      // MongoDB GeoJSON Point specification uses [longitude, latitude]
      setCoordinates([longitude, latitude]);
      if (accuracy) {
        setAccuracyText(`±${Math.round(accuracy)}m`);
      }

      // Step 4: Reverse-geocode coordinates to natural address string
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode && geocode.length > 0) {
          const place = geocode[0];
          const parts = [
            place.name,
            place.street,
            place.subregion || place.district || place.city,
            place.region,
          ].filter(Boolean);
          const autoAddress = parts.join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setAddressText(autoAddress);
        }
      } catch (geoErr) {
        if (!addressText) {
          setAddressText(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
      }

      setLocationStatus('success');
    } catch (err) {
      console.log('[AddItem Location Error]', err);
      setLocationStatus('error');
      setLocationError(err.message || 'Failed to detect GPS location');
      Alert.alert(
        'Location Detection Failed',
        'Could not acquire GPS: ' + (err.message || 'Please check device location settings and try again.'),
        [{ text: 'OK' }, { text: 'Retry', onPress: detectLocation }]
      );
    }
  };

  // Trigger GPS detection on mount for new listings
  useEffect(() => {
    if (!isEditing && !coordinates) {
      detectLocation();
    }
  }, [isEditing]);

  // ───────────────────────────────────────────────────────────────────────────
  // MECHANISM 5: SUBMIT LISTING (POST /api/items or PUT /api/items/:id)
  // ───────────────────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    // Rule 1: Student must have verified mobile number in profile for handoff coordination
    if (!user?.phone) {
      Alert.alert(
        'Mobile Number Required',
        'Please add your mobile number in your Profile before listing an item. It is needed to coordinate safe campus handovers.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update Profile', onPress: () => navigation.navigate('EditProfile') },
        ]
      );
      return;
    }

    // Rule 2: Title and description required
    if (!title.trim()) {
      Alert.alert('Missing Field', 'Please provide an item title.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing Field', 'Please provide a short description or story for the item.');
      return;
    }

    // Rule 3: Valid selling price required for 'sell' listing type
    if (listingType === 'sell') {
      const parsedPrice = Number(price);
      if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        Alert.alert(
          'Selling Price Required',
          'Please enter a selling price greater than ₹0 for a paid listing.'
        );
        return;
      }
    }

    // Rule 4: Real GPS location tagging required for campus radius queries
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      Alert.alert(
        'GPS Location Required',
        'Please tap "Detect GPS" so nearby students can locate this reusable item accurately.',
        [{ text: 'Detect GPS Now', onPress: detectLocation }, { text: 'Cancel', style: 'cancel' }]
      );
      return;
    }

    setSubmitting(true);
    try {
      // Step A: Verify file existence in device cache
      for (const image of selectedImages) {
        if (image?.uri && !image.isExisting) {
          const info = await FileSystem.getInfoAsync(image.uri);
          if (!info?.exists) {
            throw new Error(
              'A selected photo is no longer available on this device. Please capture or pick it again.'
            );
          }
        }
      }

      // Step B: Build multipart/form-data payload
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append('condition', condition);
      formData.append('listingType', listingType);
      formData.append('borrowDays', String(listingType === 'borrow' ? borrowDays : 0));
      formData.append('price', listingType === 'sell' ? String(Math.round(Number(price))) : '0');
      formData.append('addressText', addressText.trim() || `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`);
      formData.append('longitude', coordinates[0].toString());
      formData.append('latitude', coordinates[1].toString());

      // Safe MIME mapping table
      const mimeMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        heic: 'image/heic',
        heif: 'image/heif',
      };
      const keptImages = [];

      selectedImages.forEach((image, index) => {
        if (image.isExisting) {
          if (image.rawPath) keptImages.push(image.rawPath);
          return;
        }

        if (!image.uri) return;
        const cleanUri = image.uri.split('?')[0];
        const extensionMatch = /\.([a-zA-Z0-9]+)$/.exec(cleanUri);
        const fileType = (extensionMatch?.[1] || 'jpg').toLowerCase();

        formData.append('images', {
          uri: Platform.OS === 'ios' ? image.uri.replace('file://', '') : image.uri,
          name: `item_${Date.now()}_${index}.${fileType}`,
          type: mimeMap[fileType] || 'image/jpeg',
        });
      });

      // Preserve existing images during edit operations
      formData.append('existingImages', JSON.stringify(keptImages));

      if (isEditing) {
        const res = await itemService.updateItem(itemToEdit._id, formData);
        if (res && res.success) {
          Alert.alert(
            '🎉 Item Updated!',
            'Your changes have been saved to ReUse Radar.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      } else {
        const res = await itemService.createItem(formData);
        if (res && res.success) {
          Alert.alert(
            '🎉 Item Listed!',
            'Your reusable item is now live on the ReUse Radar map for nearby students to discover.',
            [{ text: 'View on Radar', onPress: () => navigation.navigate('Home') }]
          );
          setTitle('');
          setDescription('');
          setSelectedImages([]);
        }
      }
    } catch (err) {
      Alert.alert(
        isEditing ? 'Update Error' : 'Listing Error',
        err.message || 'Failed to submit item listing. Please check connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0FDF4" />

      {/* Screen Top Bar */}
      <View style={styles.topBar}>
        {isEditing ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.topBarTitleRow}>
          <View style={styles.miniLogoBox}>
            <Text style={styles.miniLogoLetter}>R</Text>
          </View>
          <Text style={styles.topBarTitle}>
            {isEditing ? 'Edit Item Listing' : 'List Free Item'}
          </Text>
        </View>
        <Text style={styles.tagSubtitle}>
          {isEditing ? 'Save updates' : 'Pass it forward'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Photo Selection Strip Section */}
        <Text style={styles.sectionLabel}>PHOTO OF ITEM *</Text>
        <View style={styles.photoStripBlock}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
          >
            {selectedImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri: image.uri }} style={styles.thumbImage} resizeMode="cover" />

                {index === 0 ? (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>COVER</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.thumbDeleteBtn}
                  onPress={() => removeSelectedImage(index)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.thumbDeleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}

            {selectedImages.length < MAX_PHOTOS ? (
              <TouchableOpacity
                style={styles.addPhotoTile}
                onPress={pickFromGallery}
                activeOpacity={0.85}
              >
                <Text style={styles.addPhotoPlus}>＋</Text>
                <Text style={styles.addPhotoLabel}>
                  Add Photo ({selectedImages.length}/{MAX_PHOTOS})
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          {/* Native Camera and Gallery Action Buttons */}
          <View style={styles.photoActionsRow}>
            <TouchableOpacity
              style={styles.photoActionBtn}
              onPress={handleOpenNativeCamera}
              disabled={launchingCamera || selectedImages.length >= MAX_PHOTOS}
              activeOpacity={0.8}
            >
              <Text style={styles.photoActionText}>
                📸 {launchingCamera ? 'Opening…' : 'Take Photo'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.photoActionBtn}
              onPress={pickFromGallery}
              disabled={selectedImages.length >= MAX_PHOTOS}
              activeOpacity={0.8}
            >
              <Text style={styles.photoActionText}>🖼️ Gallery</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.photoCountHint}>
            {selectedImages.length === 0
              ? 'Add up to 5 photos — the first photo becomes your cover.'
              : `${selectedImages.length} of ${MAX_PHOTOS} photos • swipe the strip to review`}
          </Text>
        </View>

        {/* Item Title Input */}
        <Text style={styles.sectionLabel}>ITEM TITLE *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Solid Teak Wooden Study Table"
          placeholderTextColor="#94A3B8"
          value={title}
          onChangeText={setTitle}
        />

        {/* Category Picker Chips */}
        <Text style={styles.sectionLabel}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Listing Type: Free Giveaway / Sell for Cash / Borrow */}
        <Text style={styles.sectionLabel}>LISTING TYPE</Text>
        <View style={styles.listingTypeRow}>
          <TouchableOpacity
            style={[styles.listingTypeCard, listingType === 'donation' && styles.listingTypeCardActive]}
            onPress={() => setListingType('donation')}
            activeOpacity={0.85}
          >
            <Text style={styles.listingTypeEmoji}>🎁</Text>
            <Text
              style={[
                styles.listingTypeTitle,
                listingType === 'donation' && styles.listingTypeTitleActive,
              ]}
            >
              Free Giveaway
            </Text>
            <Text
              style={[
                styles.listingTypeHint,
                listingType === 'donation' && styles.listingTypeHintActive,
              ]}
            >
              Free for someone
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listingTypeCard, listingType === 'sell' && styles.listingTypeCardActive]}
            onPress={() => setListingType('sell')}
            activeOpacity={0.85}
          >
            <Text style={styles.listingTypeEmoji}>💰</Text>
            <Text
              style={[
                styles.listingTypeTitle,
                listingType === 'sell' && styles.listingTypeTitleActive,
              ]}
            >
              Sell for Cash
            </Text>
            <Text
              style={[
                styles.listingTypeHint,
                listingType === 'sell' && styles.listingTypeHintActive,
              ]}
            >
              Sell at your price
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.listingTypeCard, listingType === 'borrow' && styles.listingTypeCardActive]}
            onPress={() => setListingType('borrow')}
            activeOpacity={0.85}
          >
            <Text style={styles.listingTypeEmoji}>🔄</Text>
            <Text
              style={[
                styles.listingTypeTitle,
                listingType === 'borrow' && styles.listingTypeTitleActive,
              ]}
            >
              Borrow
            </Text>
            <Text
              style={[
                styles.listingTypeHint,
                listingType === 'borrow' && styles.listingTypeHintActive,
              ]}
            >
              Lend & take back
            </Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Price Field if 'sell' is selected */}
        {listingType === 'sell' ? (
          <>
            <Text style={styles.sectionLabel}>SELLING PRICE (₹) *</Text>
            <View style={styles.priceInputWrap}>
              <Text style={styles.pricePrefix}>₹</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="e.g. 350"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={6}
                value={price}
                onChangeText={(text) => setPrice(text.replace(/[^0-9]/g, ''))}
              />
            </View>
            <Text style={styles.priceHint}>
              Set a fair price for fellow students. Prices are shown on your listing in ₹.
            </Text>
          </>
        ) : null}

        {/* Dynamic Borrow Return Duration if 'borrow' is selected */}
        {listingType === 'borrow' ? (
          <>
            <Text style={styles.sectionLabel}>RETURN WITHIN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {BORROW_DURATIONS.map((option) => (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.chip, borrowDays === option.days && styles.chipActive]}
                  onPress={() => setBorrowDays(option.days)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      borrowDays === option.days && styles.chipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* Condition Picker Chips */}
        <Text style={styles.sectionLabel}>CONDITION</Text>
        <View style={styles.conditionRow}>
          {CONDITIONS.filter((c) => c !== 'All').map((cond) => (
            <TouchableOpacity
              key={cond}
              style={[styles.condChip, condition === cond && styles.condChipActive]}
              onPress={() => setCondition(cond)}
            >
              <Text style={[styles.condChipText, condition === cond && styles.condChipTextActive]}>
                {cond}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description & Story Input */}
        <Text style={styles.sectionLabel}>ITEM STORY & NOTES *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Why are you parting with it? Condition details, dimensions, and who might find it useful..."
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />

        {/* Location Section with Native GPS Tagging */}
        <View style={styles.locationLabelRow}>
          <Text style={styles.sectionLabel}>PICKUP LOCATION & GPS TAG *</Text>
          <TouchableOpacity
            onPress={detectLocation}
            style={styles.autoLocBtn}
            disabled={locationStatus === 'loading'}
          >
            {locationStatus === 'loading' ? (
              <ActivityIndicator size="small" color="#064E3B" />
            ) : (
              <Text style={styles.autoLocText}>🎯 Detect GPS</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Real GPS Lock Status Card */}
        {coordinates ? (
          <View style={styles.gpsLockedCard}>
            <View style={styles.gpsLockedRow}>
              <Text style={styles.gpsTargetEmoji}>🎯</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.gpsLockedTitle}>Real GPS Location Locked</Text>
                <Text style={styles.gpsCoordsText}>
                  Lat: {coordinates[1]?.toFixed(5)}, Lng: {coordinates[0]?.toFixed(5)}
                  {accuracyText ? ` (${accuracyText})` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={detectLocation}
                style={styles.gpsRefreshBtn}
                disabled={locationStatus === 'loading'}
              >
                <Text style={styles.gpsRefreshBtnText}>🔄 Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : locationStatus === 'loading' ? (
          <View style={styles.gpsLoadingCard}>
            <ActivityIndicator color="#064E3B" size="small" />
            <Text style={styles.gpsLoadingText}>Acquiring real device GPS coordinates...</Text>
          </View>
        ) : (
          <View style={styles.gpsWarningCard}>
            <Text style={styles.gpsWarningIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.gpsWarningTitle}>GPS Coordinates Not Tagged</Text>
              <Text style={styles.gpsWarningSub}>
                {locationError || 'Tap "Detect GPS" to enable location so campus neighbors can find your item.'}
              </Text>
            </View>
            <TouchableOpacity onPress={detectLocation} style={styles.detectNowBtn}>
              <Text style={styles.detectNowBtnText}>Detect</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Pickup Address / Landmark Input */}
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder="e.g. Navrangpura, near Gujarat University Library"
          placeholderTextColor="#94A3B8"
          value={addressText}
          onChangeText={setAddressText}
        />

        {/* Safety & Policy Notice Banner */}
        <View style={styles.safetyNoticeCard}>
          <Text style={styles.safetyNoticeIcon}>🌱</Text>
          <Text style={styles.safetyNoticeText}>
            {listingType === 'sell'
              ? 'ReUse Radar never charges a listing fee. Payment happens directly with the buyer on campus.'
              : 'ReUse Radar is 100% free. No cash or trade fees may be charged for free giveaway and borrow listings.'}
          </Text>
        </View>

        {/* Publish / Update Action Button */}
        <TouchableOpacity
          style={[styles.publishBtn, submitting && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#BEF264" />
          ) : (
            <Text style={styles.publishBtnText}>
              {isEditing ? '💾 Update Item Listing' : '🚀 Publish Free Item on Radar'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

// UI Stylesheet definitions
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: '#F0FDF4',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#064E3B',
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniLogoBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniLogoLetter: {
    color: '#BEF264',
    fontSize: 16,
    fontWeight: '900',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  tagSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  photoStripBlock: {
    marginBottom: 2,
  },
  thumbStrip: {
    gap: 10,
    paddingVertical: 2,
    paddingRight: 4,
  },
  thumbWrap: {
    width: 104,
    height: 104,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#000000',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbDeleteBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(220, 38, 38, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDeleteText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 12,
  },
  coverBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    backgroundColor: 'rgba(6, 78, 59, 0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coverBadgeText: {
    color: '#BEF264',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  addPhotoTile: {
    width: 104,
    height: 104,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderStyle: 'dashed',
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  addPhotoPlus: {
    fontSize: 24,
    fontWeight: '900',
    color: '#059669',
    lineHeight: 26,
  },
  addPhotoLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    textAlign: 'center',
    marginTop: 3,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  photoActionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActionText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },
  photoCountHint: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  conditionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  listingTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  listingTypeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  listingTypeCardActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  listingTypeEmoji: {
    fontSize: 18,
    marginBottom: 6,
  },
  listingTypeTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  listingTypeTitleActive: {
    color: '#BEF264',
  },
  listingTypeHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 3,
  },
  listingTypeHintActive: {
    color: '#D1FAE5',
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
    paddingHorizontal: 14,
  },
  pricePrefix: {
    fontSize: 20,
    fontWeight: '900',
    color: '#047857',
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  priceHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
  },
  condChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  condChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  condChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  condChipTextActive: {
    color: '#FFFFFF',
  },
  locationLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  autoLocBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  autoLocText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  gpsLockedCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
  },
  gpsLockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsTargetEmoji: {
    fontSize: 20,
  },
  gpsLockedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  gpsCoordsText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  gpsRefreshBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  gpsRefreshBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#064E3B',
  },
  gpsLoadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  gpsLoadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  gpsWarningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
  },
  gpsWarningIcon: {
    fontSize: 18,
  },
  gpsWarningTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  gpsWarningSub: {
    fontSize: 10,
    color: '#92400E',
    marginTop: 1,
  },
  detectNowBtn: {
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detectNowBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  safetyNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  safetyNoticeIcon: {
    fontSize: 18,
  },
  safetyNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#064E3B',
    fontWeight: '600',
    lineHeight: 16,
  },
  publishBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 16,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    color: '#BEF264',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

export default AddItemScreen;
