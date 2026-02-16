# React Native + Expo -- Mobile Build Guidance

> Stack overlay for the Frontend Builder. This supplements the generic role with React Native and Expo-specific patterns, conventions, and gotchas for mobile development.

---

## Stack Discovery

Detect Expo by checking for these files:

| File | Indicator |
|---|---|
| `app.json` or `app.config.js` | Expo project config |
| `expo` in package.json dependencies | Expo SDK |
| `expo-router` in package.json | File-based routing |
| `@react-navigation/*` in package.json | Stack/tab navigation |

Check the Expo SDK version in `package.json` under `expo`. SDK 50+ uses the modern file-based router by default.

---

## Project Structure

### Expo Router (file-based, SDK 49+)

```
app/
  _layout.tsx              -- Root layout (navigation container)
  index.tsx                -- Home screen (/)
  tasks/
    _layout.tsx            -- Tasks stack layout
    index.tsx              -- Task list (/tasks)
    [id].tsx               -- Task detail (/tasks/:id)
    create.tsx             -- Create task (/tasks/create)
components/
  TaskItem.tsx
  TaskForm.tsx
  ConfirmDialog.tsx
  EmptyState.tsx
hooks/
  useAuth.ts
  useTasks.ts
api/
  tasks.ts
  auth.ts
assets/
  images/
  fonts/
app.json                  -- Expo config
```

### React Navigation (traditional)

```
src/
  screens/
    TaskListScreen.tsx
    TaskDetailScreen.tsx
    CreateTaskScreen.tsx
  components/
    TaskItem.tsx
    TaskForm.tsx
    ConfirmDialog.tsx
  navigation/
    AppNavigator.tsx
    AuthNavigator.tsx
  hooks/
  api/
App.tsx
app.json
```

Use whichever navigation pattern the project already follows.

---

## Navigation

### Expo Router (file-based)

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'My Tasks' }} />
      <Stack.Screen name="tasks/[id]" options={{ title: 'Task Detail' }} />
    </Stack>
  );
}
```

Navigation:

```tsx
import { router, Link } from 'expo-router';

// Programmatic navigation
router.push('/tasks/create');
router.push(`/tasks/${task.id}`);
router.back();

// Declarative navigation
<Link href="/tasks/create">Create Task</Link>
```

### React Navigation (traditional)

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="TaskList" component={TaskListScreen} />
        <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

Navigation:

```tsx
const navigation = useNavigation();
navigation.navigate('TaskDetail', { id: task.id });
navigation.goBack();
```

---

## Components

### Core Differences from React Web

React Native does not use HTML elements. Map these:

| Web | React Native |
|---|---|
| `<div>` | `<View>` |
| `<span>`, `<p>` | `<Text>` |
| `<img>` | `<Image>` |
| `<input>` | `<TextInput>` |
| `<button>` | `<Pressable>` or `<TouchableOpacity>` |
| `<ul>/<li>` | `<FlatList>` |
| `<ScrollView>` | `<ScrollView>` |

### List Component

```tsx
function TaskList({ tasks, onComplete, onDelete }) {
  return (
    <FlatList
      data={tasks}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TaskItem
          task={item}
          onComplete={onComplete}
          onDelete={onDelete}
        />
      )}
      ListEmptyComponent={<EmptyState message="No tasks yet" />}
      testID="task-list"
    />
  );
}
```

### Form Component

```tsx
function TaskForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      await onSubmit({ title: title.trim() });
      setTitle('');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <View testID="task-form">
      <Text>Title</Text>
      <TextInput
        testID="title-input"
        value={title}
        onChangeText={setTitle}
        placeholder="Enter task title"
        accessibilityLabel="Task title"
      />
      {error ? <Text testID="error-message" style={styles.error}>{error}</Text> : null}
      <Pressable testID="submit-btn" onPress={handleSubmit} style={styles.button}>
        <Text style={styles.buttonText}>Add Task</Text>
      </Pressable>
    </View>
  );
}
```

---

## Styling

### StyleSheet.create

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#ffffff',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  completed: {
    opacity: 0.6,
    textDecorationLine: 'line-through',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  error: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 4,
  },
});
```

### Platform-Specific Styles

```tsx
import { Platform, StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    android: {
      elevation: 4,
    },
  }),
});
```

**Key differences from CSS**:
- No cascading -- styles do not inherit (except `Text` within `Text`)
- Flexbox is default (`flexDirection: 'column'` by default, not `row`)
- No units -- all values are density-independent pixels
- No pseudo-classes (`:hover`, `:focus`) -- use `Pressable` with style functions

---

## Confirmation Dialog

Use a `Modal` component, not a browser alert:

```tsx
function ConfirmDialog({ visible, message, onConfirm, onCancel }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      testID="confirm-dialog"
    >
      <View style={styles.overlay}>
        <View style={styles.dialog} accessibilityRole="alert">
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} testID="cancel-btn">
              <Text>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} testID="confirm-btn" style={styles.dangerButton}>
              <Text style={styles.dangerText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

---

## Expo SDK Modules

Common modules for task/CRUD apps:

```tsx
import * as SecureStore from 'expo-secure-store';  // Token storage
import Constants from 'expo-constants';             // App config values
import * as Haptics from 'expo-haptics';            // Tactile feedback
```

### Secure Token Storage

```tsx
import * as SecureStore from 'expo-secure-store';

async function saveToken(token: string) {
  await SecureStore.setItemAsync('auth_token', token);
}

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

async function deleteToken() {
  await SecureStore.deleteItemAsync('auth_token');
}
```

**Do NOT use AsyncStorage for auth tokens.** AsyncStorage is unencrypted. Use `expo-secure-store` for sensitive data.

---

## API Calls

Same patterns as React web, but with considerations for mobile:

```tsx
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

async function fetchTasks(token: string): Promise<Task[]> {
  const response = await fetch(`${API_URL}/api/tasks`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch tasks');
  }

  return response.json();
}
```

**Gotcha**: `localhost` does not work on physical devices. For development, use your machine's LAN IP or configure Expo's proxy.

---

## Platform-Specific Code

```tsx
import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
  // iOS-specific behavior
} else if (Platform.OS === 'android') {
  // Android-specific behavior
}

// Platform-specific files
// TaskItem.ios.tsx -- used on iOS
// TaskItem.android.tsx -- used on Android
// TaskItem.tsx -- fallback
```

---

## EAS Build and Submit

```bash
# Development build (includes dev tools)
eas build --profile development --platform ios

# Preview build (for testing)
eas build --profile preview --platform all

# Production build
eas build --profile production --platform all

# Submit to app stores
eas submit --platform ios
eas submit --platform android
```

Configure profiles in `eas.json`.

---

## Testability

Use `testID` (not `data-testid`) for React Native elements:

```tsx
<View testID="task-list">
<TextInput testID="title-input">
<Pressable testID="submit-btn">
<Modal testID="confirm-dialog">
<View testID="empty-state">
```

Also use `accessibilityLabel` and `accessibilityRole` for accessibility-based queries.

---

## Common Gotchas

1. **`testID` not `data-testid`** -- React Native uses `testID` prop, not HTML data attributes
2. **No CSS** -- All styling is via `StyleSheet.create` or inline style objects. No class names, no CSS files
3. **Flexbox defaults differ** -- `flexDirection` defaults to `'column'` (not `'row'` like web CSS)
4. **Text must be in `<Text>`** -- Raw strings outside `<Text>` components cause crashes
5. **localhost on devices** -- Physical devices cannot reach `localhost`. Use LAN IP or Expo's tunnel
6. **Keyboard covering inputs** -- Use `KeyboardAvoidingView` to prevent the keyboard from covering form inputs
7. **Safe areas** -- Use `SafeAreaView` or `expo-safe-area-context` to avoid notch/status bar overlap
8. **FlatList vs map** -- Always use `FlatList` for dynamic lists. Mapping in a `ScrollView` does not virtualize and will cause performance issues with large lists
9. **Hot reload state loss** -- Fast refresh preserves state in function components but resets class components. Keep state initialization in mind during development
