# Input System

The input system provides a flexible, React-based way to handle keyboard input in Ink applications. It supports action registration with modifiers, automatic help text generation, and proper cleanup on component unmount. The system is built on MobX for reactive state management.

## Core Concepts

### InputController

The `InputController` is a MobX observable class that:

- Manages registered input action mappings
- Matches incoming input events to actions
- Provides reactive help hints for display in the UI
- Executes only ONE action per keypress (first match in reverse registration order)

### Input Matchers

Input matchers define which key presses trigger an action. They can be specified in two ways:

**Simple string matcher:**

```typescript
'a' // Single character
'#' // Shifted character
'return' // Special key name
'escape' // Another special key
```

**Object matcher with modifier:**

```typescript
{ key: 'a', modifier: 'ctrl' }      // Ctrl+A
{ key: 'return', modifier: 'shift' } // Shift+Return
```

Available modifiers: `'ctrl'` | `'shift'`

> **Note:** The `shift` modifier is only passed for special keys. For regular characters, shift changes the character itself (e.g., shift+3 becomes '#', not '3' with shift modifier).

### Action Mappings

An `InputActionMapping` connects a matcher to an action function:

```typescript
interface InputActionMapping {
  input: InputMatcher // What key(s) trigger this
  action: () => void // What to do when triggered
  hint?: string // Optional help text for UI
}
```

## Usage

### 1. Setup Provider

The `InputController` lives in the `UiStore` as a MobX observable. Wrap your app with `InputProvider` to connect it to Ink's input events:

```tsx
import { InputProvider } from './input/input-context.js'
import { StoreProvider } from './store/store-context.js'
import { store } from './store/root-store.js'

function App() {
  return (
    <StoreProvider store={store}>
      <InputProvider>
        <YourApp />
      </InputProvider>
    </StoreProvider>
  )
}
```

The `InputProvider` automatically connects to `store.ui.input` via MobX.

### 2. Register Actions in Components

Use the `useInputActions` hook to register actions that are automatically cleaned up on unmount:

```tsx
import { useInputActions } from './input/hooks/use-input-actions.js'

function MyComponent() {
  useInputActions((register) => {
    // Simple character
    register(
      't',
      () => {
        console.log('T pressed')
      },
      'advance turn',
    )

    // With modifier
    register(
      { key: 'c', modifier: 'ctrl' },
      () => {
        console.log('Ctrl+C pressed')
      },
      'cancel',
    )

    // Special key
    register(
      'return',
      () => {
        console.log('Enter pressed')
      },
      'confirm',
    )

    // No hint (won't appear in help UI)
    register('x', () => {
      console.log('X pressed')
    })
  })

  return <Box>My Component</Box>
}
```

### 3. Dependencies

Like `useEffect`, you can specify dependencies to re-register actions when values change:

```tsx
const [mode, setMode] = useState('normal')

useInputActions(
  (register) => {
    if (mode === 'normal') {
      register('i', () => setMode('insert'), 'insert mode')
    } else {
      register('escape', () => setMode('normal'), 'normal mode')
    }
  },
  [mode],
) // Re-register when mode changes
```

## Advanced Usage

### Manual Controller Access

For fine-grained control, access the controller directly via the store:

```tsx
import { useStore } from './store/store-context.js'
import { observer } from 'mobx-react-lite'

const MyComponent = observer(() => {
  const controller = useStore().ui.input

  // Manually add action
  const mapping: InputActionMapping = {
    input: 'q',
    action: () => console.log('Q pressed'),
    hint: 'quit',
  }
  controller.add(mapping)

  // Get all hints for display (reactive!)
  const hints = controller.hints
  // Returns: [{ keyBind: 'q', description: 'quit' }, ...]

  // Don't forget to remove on cleanup!
  useEffect(() => {
    return () => controller.remove(mapping)
  }, [controller])

  return <Box>{hints.length} hints available</Box>
})
```

Note: Wrap components with `observer()` to react to hint changes.

### Action Priority

Actions are matched in **reverse registration order** (last-in, first-matched):

```tsx
useInputActions((register) => {
  register('a', () => console.log('First')) // Registered first
  register('a', () => console.log('Second')) // Registered second
})

// Pressing 'a' prints: "Second"
// The second registration takes precedence
```

This allows components to override parent actions.

### Async Actions

Action functions can be async:

```tsx
useInputActions((register) => {
  register(
    's',
    async () => {
      await saveData()
      console.log('Saved!')
    },
    'save',
  )
})
```

## Architecture

```
┌─────────────────────────────────────┐
│  StoreProvider                      │
│  - Provides MobX store via Context  │
│  └─ RootStore                       │
│     └─ UiStore                      │
│        └─ InputController (MobX)    │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  InputProvider                      │
│  - Wraps useInput from Ink          │
│  - Accesses store.ui.input          │
│  - Forwards events to controller    │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  InputController (MobX Observable)  │
│  - Stores action mappings (Set)     │
│  - Stores hints (Set, observable)   │
│  - Matches input to actions         │
│  - Executes first matching action   │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Component with useInputActions     │
│  - Registers actions on mount       │
│  - Wraps add/remove in runInAction  │
│  - Updates on dependency changes    │
│  - Cleans up on unmount             │
└─────────────────────────────────────┘
```

## Best Practices

1. **Use `useInputActions` for component-scoped actions** - Automatic cleanup prevents memory leaks
2. **Provide hints for user-facing actions** - Helps users discover available commands
3. **Order matters** - Register more specific actions after general ones to override
4. **Declare dependencies** - Re-register when action behavior depends on state
5. **Keep actions focused** - One action per key combination for clarity
6. **Use `observer()` when displaying hints** - Components that read `controller.hints` must be MobX observers
7. **Avoid stale closures** - Be careful when actions capture component state (see Dependencies section)

## Important: Action Execution Model

**Only ONE action executes per keypress.** When a key is pressed:

1. Actions are checked in **reverse registration order** (most recently registered first)
2. The **first matching** action is executed
3. **All other** matching actions are ignored

This allows child components to override parent component actions for the same key.

## Important: Closure Captures and Dependencies

Actions can capture stale state if dependencies aren't declared properly:

```tsx
// ❌ BAD: Captures stale count
const [count, setCount] = useState(0)

useInputActions((register) => {
  register('c', () => {
    console.log(count) // Always prints initial count!
  })
}) // Missing [count] dependency

// ✅ GOOD: Re-registers when count changes
useInputActions(
  (register) => {
    register('c', () => {
      console.log(count) // Prints current count
    })
  },
  [count],
)
```

**Warning:** Re-registering on every state change can be expensive. Consider:

1. Using MobX observables instead of React state
2. Using `useCallback` to memoize action functions
3. Accessing state via store instead of closure capture

## Example: Mode-Based Input

```tsx
function Editor() {
  const [mode, setMode] = useState<'normal' | 'insert'>('normal')
  const [text, setText] = useState('')

  useInputActions(
    (register) => {
      if (mode === 'normal') {
        register('i', () => setMode('insert'), 'insert mode')
        register('x', () => setText(text.slice(0, -1)), 'delete char')
      } else {
        register('escape', () => setMode('normal'), 'normal mode')
      }
    },
    [mode, text],
  )

  return (
    <Box flexDirection='column'>
      <Text>Mode: {mode}</Text>
      <Text>Text: {text}</Text>
    </Box>
  )
}
```
