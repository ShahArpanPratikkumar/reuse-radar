# ReUse Radar — Complete Architecture & Technical Specification

## 1. Requirements Analysis

### 1.1 Project Overview
**ReUse Radar** is a circular economy mobile application designed for college campuses and local communities. It solves the critical problem of resource waste (textbooks, lab coats, electronics, cycles, furniture, kettles, and stationery) during semester transitions by providing a hyper-local, proximity-based reuse and exchange network.

### 1.2 College & Academic Deliverables
1. **Frontend**: React Native with Expo SDK and React Navigation.
2. **Backend**: Node.js and Express.js REST API.
3. **Database**: MongoDB Atlas with geospatial indexing (`2dsphere`).
4. **Authentication**: Production-grade JWT with bcryptjs password hashing and persistent sessions.
5. **Native Features**: Demonstration of 10 genuine native device capabilities.
6. **Delivery**: Clean GitHub repository and installable Android APK (via Expo EAS).

---

## 2. System Architecture

```
+-----------------------------------------------------------------------------------+
|                           Mobile Client (React Native + Expo)                     |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  |     Screens        |  |  React Navigation  |  |      Context Providers      |  |
|  |  (Auth, Explore,   |  |   (Root, Auth,     |  |   (AuthContext,             |  |
|  |   Add, Details)    |  |    Main Tabs)      |  |    NetworkStatus)           |  |
|  +---------+----------+  +---------+----------+  +--------------+--------------+  |
|            |                       |                            |                 |
|  +---------v-----------------------v----------------------------v--------------+  |
|  |                       Axios HTTP Client (api.js)                            |  |
|  |             - Injects Bearer JWT Token automatically                        |  |
|  |             - Intercepts 401s & maps error responses                        |  |
|  +---------------------------------+-------------------------------------------+  |
|                                    |                                              |
|  +---------------------------------v-------------------------------------------+  |
|  |                     Native Modules & Device Capabilities                    |  |
|  |  - Camera (expo-camera)          - Location (expo-location)                 |  |
|  |  - Contacts (expo-contacts)      - Clipboard (expo-clipboard)               |  |
|  |  - Share (expo-sharing)          - Notifications (expo-notifications)       |  |
|  |  - Network (NetInfo/Network)     - File System (expo-file-system)           |  |
|  |  - Splash (expo-splash-screen)   - Secure Storage (AsyncStorage)            |  |
|  +-----------------------------------------------------------------------------+  |
+------------------------------------+----------------------------------------------+
                                     |  HTTP / HTTPS REST + Multipart Form
                                     v
+------------------------------------+----------------------------------------------+
|                        Backend API Server (Node.js + Express)                     |
|                                                                                   |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  | CORS & Rate Limit  |  |   JWT Auth Guard   |  | Multer File Processor       |  |
|  | Middleware         |  |   (authMiddleware) |  | (Validates size & MIME type)|  |
|  +---------+----------+  +---------+----------+  +--------------+--------------+  |
|            |                       |                            |                 |
|  +---------v-----------------------v----------------------------v--------------+  |
|  |                            Express Router & Controllers                     |  |
|  |  - authController.js     - itemController.js      - requestController.js    |  |
|  +---------------------------------+-------------------------------------------+  |
|                                    |                                              |
|  +---------------------------------v-------------------------------------------+  |
|  |                     Mongoose ODM & Data Models                              |  |
|  |  - User.js               - Item.js (2dsphere)     - Request.js              |  |
|  +---------------------------------+-------------------------------------------+  |
+------------------------------------+----------------------------------------------+
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
+-----------------------------+             +-------------------------------+
|    MongoDB Atlas Cluster    |             | Local File System /uploads    |
| - Users Collection          |             | - Stored item photos          |
| - Items (2dsphere index)    |             | - Express static file serving |
| - Requests (Handover codes) |             +-------------------------------+
+-----------------------------+
```

---

## 3. Production Folder Structure

```
ReUseRadar/
├── app/
│   ├── screens/
│   │   ├── SplashScreen.jsx         # Splash hold & app bootstrap
│   │   ├── LoginScreen.jsx          # User login
│   │   ├── RegisterScreen.jsx       # User registration
│   │   ├── HomeScreen.jsx           # Proximity feed & category chips
│   │   ├── ExploreScreen.jsx        # Radar search & radius filter
│   │   ├── AddItemScreen.jsx        # Camera capture & location geotag
│   │   ├── ItemDetailsScreen.jsx    # Item view, share, copy address, request
│   │   ├── ProfileScreen.jsx        # Karma stats, export impact certificate
│   │   ├── NotificationsScreen.jsx  # Push alerts list
│   │   └── MyItemsScreen.jsx        # My listings & handover code copy
│   │
│   ├── components/
│   │   ├── ItemCard.jsx             # Card with photo, title, distance badge
│   │   ├── SearchBar.jsx            # Search input field
│   │   ├── CategoryChip.jsx         # Filter pills (Books, Electronics, etc.)
│   │   ├── EmptyState.jsx           # Clean zero-data illustration
│   │   └── LoadingSpinner.jsx       # Standardized loading indicator
│   │
│   ├── navigation/
│   │   ├── AuthNavigator.jsx        # Login & Register stack
│   │   ├── MainNavigator.jsx        # Bottom Tabs + Detail Stacks
│   │   └── RootNavigator.jsx        # Auth switch + Offline banner
│   │
│   ├── services/
│   │   ├── api.js                   # Axios client + JWT interceptor
│   │   ├── authService.js           # Auth API methods
│   │   └── itemService.js           # Items & Requests API methods
│   │
│   ├── hooks/
│   │   └── useNetworkStatus.js      # Real-time online/offline detector
│   │
│   ├── utils/
│   │   ├── storage.js               # AsyncStorage wrapper
│   │   └── constants.js             # Theme colors, categories, conditions
│   │
│   └── context/
│       └── AuthContext.jsx          # Global user & token session state
│
├── assets/                          # App icons & images
├── server/
│   ├── config/
│   │   └── db.js                    # MongoDB Atlas Mongoose connection
│   ├── models/
│   │   ├── User.js                  # User schema
│   │   ├── Item.js                  # Item schema with GeoJSON 2dsphere
│   │   └── Request.js               # Exchange request & handover code
│   ├── controllers/
│   │   ├── authController.js        # Register, login, profile logic
│   │   ├── itemController.js        # CRUD & $near geospatial queries
│   │   └── requestController.js     # Requests & handover verification
│   ├── routes/
│   │   ├── authRoutes.js            # Auth endpoints
│   │   ├── itemRoutes.js            # Item endpoints
│   │   └── requestRoutes.js         # Request endpoints
│   ├── middleware/
│   │   └── authMiddleware.js        # JWT verify & Multer upload
│   ├── uploads/                     # Uploaded item pictures
│   ├── server.js                    # Express application entry
│   ├── package.json
│   └── .env                         # Server environment variables
│
├── .env                             # Frontend environment variables
├── App.jsx                          # App root component
├── index.js                         # Expo entry point
├── app.json                         # Expo configuration
├── package.json
└── README.md
```

---

## 4. Database Schemas

### 4.1 User Schema (`server/models/User.js`)
```javascript
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  password: { type: String, required: true, minlength: 6 },
  phone: { type: String, default: '' },
  collegeName: { type: String, default: 'Engineering College' },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [77.5946, 12.9716] } // [longitude, latitude]
  },
  addressName: { type: String, default: 'Campus Main Gate' },
  karmaPoints: { type: Number, default: 50 },
  itemsDonatedCount: { type: Number, default: 0 },
  itemsClaimedCount: { type: Number, default: 0 },
  expoPushToken: { type: String, default: '' }
}, { timestamps: true });

userSchema.index({ location: '2dsphere' });
module.exports = mongoose.model('User', userSchema);
```

### 4.2 Item Listing Schema (`server/models/Item.js`)
```javascript
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['Books', 'Electronics', 'Clothing', 'Cycles', 'Stationery', 'Furniture', 'Household', 'Toys', 'Other'],
    index: true
  },
  condition: {
    type: String,
    required: true,
    enum: ['Like New', 'Gently Used', 'Functional', 'Needs Minor Repair']
  },
  images: [{ type: String, required: true }],
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: {
    type: String,
    enum: ['available', 'requested', 'reserved', 'claimed'],
    default: 'available',
    index: true
  },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  addressText: { type: String, required: true },
  views: { type: Number, default: 0 }
}, { timestamps: true });

itemSchema.index({ location: '2dsphere' });
module.exports = mongoose.model('Item', itemSchema);
```

### 4.3 Exchange Request Schema (`server/models/Request.js`)
```javascript
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, required: true },
  proposedTime: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  handoverCode: { type: String, default: '' }, // 4-digit verification code
  completedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Request', requestSchema);
```

---

## 5. RESTful API Endpoints Specification

| Method | Endpoint | Access | Purpose | Request Body / Query Params |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user | `{ name, email, password, phone, collegeName }` |
| `POST` | `/api/auth/login` | Public | Login & receive JWT | `{ email, password }` |
| `GET` | `/api/auth/me` | Protected | Get authenticated profile | Headers: `Authorization: Bearer <token>` |
| `PUT` | `/api/auth/push-token` | Protected | Register Expo push token | `{ pushToken }` |
| `GET` | `/api/items/nearby` | Public/Auth | Geospatial radius search | Query: `lat`, `lng`, `radiusKm`, `category`, `search` |
| `GET` | `/api/items` | Public | Get all active items | Query: `page`, `limit`, `category` |
| `GET` | `/api/items/:id` | Public | Get single item details | Params: `id` |
| `POST` | `/api/items` | Protected | Create new item listing | `multipart/form-data`: `title, description, category, condition, addressText, coordinates, images` |
| `GET` | `/api/items/user/my-listings` | Protected | Get items posted by user | Headers: `Authorization: Bearer <token>` |
| `DELETE`| `/api/items/:id` | Protected | Delete listing (owner only) | Params: `id` |
| `POST` | `/api/requests` | Protected | Request an item | `{ itemId, message, proposedTime }` |
| `GET` | `/api/requests/incoming` | Protected | Requests received on my items| Headers: `Authorization: Bearer <token>` |
| `GET` | `/api/requests/outgoing` | Protected | Requests I have sent | Headers: `Authorization: Bearer <token>` |
| `PUT` | `/api/requests/:id/respond`| Protected | Accept or reject request | `{ action: 'approve' \| 'reject' }` |
| `POST` | `/api/requests/:id/verify-handover`| Protected | Verify 4-digit code & mark claimed | `{ enteredCode: '1234' }` |

---

## 6. Authentication Flow

1. **Registration**: Validates input $\rightarrow$ hashes password using `bcryptjs` (10 rounds) $\rightarrow$ creates user document $\rightarrow$ returns signed JWT token.
2. **Login**: Verifies credentials $\rightarrow$ returns `{ token, user }`.
3. **Storage**: App stores `token` and `user` in `AsyncStorage`.
4. **Interception**: Axios request interceptor injects `Authorization: Bearer ${token}` on every HTTP request.
5. **Session Restore**: On launch, `AuthContext` checks `AsyncStorage` and calls `GET /api/auth/me`. If valid, user enters `MainNavigator`. If invalid, redirects to `AuthNavigator`.
6. **401 Response**: Automatically clears storage and logs out cleanly.

---

## 7. Navigation Flow

```
RootNavigator
│
├── SplashScreen (Native Splash hold & token/location restore)
│
├── AuthNavigator (if isAuthenticated === false)
│   ├── LoginScreen
│   └── RegisterScreen
│
└── MainNavigator (if isAuthenticated === true)
    ├── Bottom Tabs:
    │   ├── HomeScreen (Feed of nearby items, category chips, impact banner)
    │   ├── ExploreScreen (Radar search with interactive radius slider)
    │   ├── AddItemScreen (Camera capture, auto-geotag, publish)
    │   ├── NotificationsScreen (Push alerts list)
    │   └── ProfileScreen (Karma stats, export certificate, invite classmates)
    │
    └── Modal / Detail Screens:
        ├── ItemDetailsScreen (Photos, address copy, share, request modal)
        └── MyItemsScreen (My listings, incoming requests, handover code copy)
```

---

## 8. Integration of the 10 Native React Native Features

| # | Feature | Package | Exact Screen & Workflow |
|---|---|---|---|
| **1** | **Camera** | `expo-camera` | **AddItemScreen.jsx**: Real-time camera viewfinder to capture item photos with flash toggle, flip, and preview before uploading. |
| **2** | **Location** | `expo-location` | **HomeScreen.jsx & ExploreScreen.jsx**: Fetches user GPS coordinates for proximity calculation and radius filtering via MongoDB `$near`. Also auto-fills pickup address in `AddItemScreen.jsx`. |
| **3** | **Contacts** | `expo-contacts` | **ProfileScreen.jsx & ItemDetailsScreen.jsx**: Opens phone address book to invite campus friends or share pickup handover details with a classmate. |
| **4** | **Clipboard** | `expo-clipboard` | **ItemDetailsScreen.jsx & MyItemsScreen.jsx**: One-tap copy of pickup address and 4-digit handover verification code with haptic feedback. |
| **5** | **Share** | `expo-sharing` & RN Share | **ItemDetailsScreen.jsx**: Shares item listing summary and deep links directly to WhatsApp class groups or Telegram channels. |
| **6** | **Notifications**| `expo-notifications` + `expo-device` | **NotificationsScreen.jsx & requestController.js**: Dispatches remote push notifications when an item is requested, approved, or handed over. |
| **7** | **Authentication**| Native Storage + JWT | **AuthContext.jsx**: Secure, persistent credential session handling with automatic token validation on app start. |
| **8** | **Network** | `useNetworkStatus.js` | **RootNavigator.jsx**: Real-time network watcher displaying an animated "Offline Banner" when connection is lost, blocking writes. |
| **9** | **File System**| `expo-file-system` | **ProfileScreen.jsx**: Generates and downloads a local Eco-Impact / Reuse Certificate into device storage for offline view or export. |
| **10**| **Splash Screen**| `expo-splash-screen` | **SplashScreen.jsx**: Smooth startup orchestration preventing white-screen flicker while verifying session tokens and GPS coordinates. |

---

## 9. Development Phases

- **Phase 1: Backend Foundation**: MongoDB Atlas connection, User/Item/Request models, JWT auth routes, item controllers, Multer static upload serving.
- **Phase 2: Mobile Infrastructure & Navigation**: Context providers (`AuthContext`, `NetworkStatus`), Axios singleton (`api.js`), React Navigation setup (`RootNavigator`, `AuthNavigator`, `MainNavigator`).
- **Phase 3: Auth & Onboarding**: `SplashScreen.jsx`, `LoginScreen.jsx`, `RegisterScreen.jsx`.
- **Phase 4: Items & Geospatial Radar Feed**: `HomeScreen.jsx`, `ExploreScreen.jsx`, `AddItemScreen.jsx` with `expo-camera` and `expo-location`.
- **Phase 5: Requests, Handover & Native Features**: `ItemDetailsScreen.jsx`, `MyItemsScreen.jsx`, `NotificationsScreen.jsx`, `ProfileScreen.jsx` (integrating Clipboard, Sharing, Contacts, Notifications, File System).
- **Phase 6: Verification, GitHub Push & APK Build Pipeline**: End-to-end testing, GitHub documentation, and EAS build configuration for Android APK export.

---

## 10. Environment Variables

### Backend (`server/.env`)
```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/reuseradar?retryWrites=true&w=majority
JWT_SECRET=reuseradar_jwt_secret_key_2026_production
JWT_EXPIRES_IN=7d
BASE_URL=http://localhost:5000
```

### Frontend (`ReUseRadar/.env`)
```env
EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:5000/api
EXPO_PUBLIC_IMAGE_BASE_URL=http://<YOUR_LAN_IP>:5000
EXPO_PUBLIC_DEFAULT_LAT=12.9716
EXPO_PUBLIC_DEFAULT_LNG=77.5946
```

---

## 11. Security Requirements
1. **Password Hashing**: `bcryptjs` with 10 salt rounds.
2. **JWT Authorization**: Header validation on protected routes (`Authorization: Bearer <token>`).
3. **Data Isolation**: Only item owners can modify/delete listings or approve requests.
4. **Input Validation**: Strict validation on coordinates, enums (categories, conditions), and required fields.
5. **Upload Protection**: Multer checks image MIME types (`image/jpeg`, `image/png`, `image/webp`) and enforces a 5MB per-file limit.
6. **NoSQL Injection Guard**: Sanitized query parameters on search and filter endpoints.

---

## 12. Frontend-Backend Communication
- Centralized Axios instance (`app/services/api.js`) with request/response interceptors.
- LAN IP configuration ensures compatibility with physical devices running Expo Go as well as emulators.
- Consistent API response schema: `{ success: true, data: ... }` or `{ success: false, message: ... }`.

---

## 13. Image Upload Architecture
1. Mobile user captures photo via `expo-camera`.
2. Image is placed in `FormData` with `{ uri, name: 'item.jpg', type: 'image/jpeg' }`.
3. Client posts `multipart/form-data` to `/api/items`.
4. Multer saves images to `server/uploads/items/` with unique timestamped filenames.
5. Stored paths are saved in MongoDB (e.g., `/uploads/items/item-1718000.jpg`).
6. Express statically serves `/uploads` so the mobile app can display photos directly.

---

## 14. Location-Based Item Discovery
1. Item schema stores coordinates in standard GeoJSON format: `{ type: "Point", coordinates: [lng, lat] }`.
2. `Item.js` creates a `2dsphere` index on `location`.
3. Queries use `$near` with `$maxDistance` (meters = $km \times 1000$).
4. The client's `ExploreScreen` sends the user's current GPS position alongside the radius slider value.

---

## 15. Complete User Journey
1. **Launch**: Splash screen displays while network, token, and location are loaded.
2. **Auth**: Student signs up or logs in.
3. **Donation**: Donor taps **Add Item**, captures photos with `expo-camera`, auto-detects pickup location via `expo-location`, and publishes.
4. **Discovery**: Seeker opens **Explore/Radar**, sets radius slider (e.g. 3km), spots the item, and taps **Request Item**.
5. **Approval**: Donor accepts the request. The backend generates a 4-digit code (e.g. `4821`).
6. **Handover**: Seeker copies the code using `expo-clipboard` and meets the donor on campus. The donor enters `4821` on `MyItemsScreen` to verify handover.
7. **Impact**: Item status changes to `claimed`, donor is awarded 50 Karma Points, and an Eco-Impact Certificate is generated and saved using `expo-file-system`.

