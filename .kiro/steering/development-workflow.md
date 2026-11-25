# Necro-Docs: Development Workflow & Best Practices

> Current implementation note: read `.kiro/steering/current-architecture.md` before changing the analyzer, graph scope, Voice Séance, Surgical Patch, or GitHub PR flow.

## Project Setup & Initialization

### Environment Preparation

```bash
# Install dependencies
npm install

# Verify all packages installed correctly
npm list

# Check Next.js version
npm list next
```

### Development Server

```bash
# Start development server
npm run dev

# Server runs at http://localhost:3000
# Auto-reloads on file changes
# HMR (Hot Module Replacement) active for React components
```

### TypeScript & Type Safety

Semua file source harus menggunakan TypeScript dengan strict mode enabled.

```typescript
// ✅ DO: Explicit types
interface Props {
  title: string;
  onSubmit: (value: string) => void;
  isLoading?: boolean;
}

export function MyComponent({ title, onSubmit, isLoading }: Props) {
  return <div>{title}</div>;
}

// ❌ DON'T: Implicit any
export function MyComponent(props) {
  return <div>{props.title}</div>;
}
```

## Component Development Standards

### File Organization

Organize components by feature dan size:

```
src/components/
├── ui/                          # Reusable UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Modal.tsx
│   └── inputs/
│       ├── TextInput.tsx
│       └── Select.tsx
├── codebase-explorer/           # Feature-specific
│   ├── index.ts                 # Barrel export
│   ├── FileTree.tsx
│   ├── StructureGraph.tsx
│   ├── useFileTree.ts           # Feature hooks
│   └── types.ts                 # Feature types
└── voice-debugger/
    ├── index.ts
    ├── VoiceInput.tsx
    └── ...
```

### Component Structure

```typescript
// src/components/example/ExampleComponent.tsx
'use client'; // If interactive

import React, { useState, useCallback } from 'react';
import { useExampleStore } from '@/stores/example.store';
import type { ExampleProps } from './types';

/**
 * ExampleComponent - Brief description
 * 
 * Handles: specific responsibility
 */
export function ExampleComponent({ title, onSelect }: ExampleProps) {
  const { data, setData } = useExampleStore();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = useCallback((value: string) => {
    setData(value);
    onSelect?.(value);
  }, [onSelect]);

  return (
    <div className="p-4 bg-blueprint-900 rounded-lg border border-ghost/20">
      <h2 className="text-lg font-bold text-neon-cyan">{title}</h2>
      {/* Component JSX */}
    </div>
  );
}

// Default export for lazy loading
export default ExampleComponent;
```

### Barrel Exports (Index Files)

```typescript
// src/components/codebase-explorer/index.ts
export { FileTree } from './FileTree';
export { StructureGraph } from './StructureGraph';
export { DependencyAnalyzer } from './DependencyAnalyzer';

export type { FileTreeProps } from './FileTree';
export type { AnalysisResult } from './types';
```

Usage:
```typescript
// ✅ Clean import
import { FileTree, StructureGraph } from '@/components/codebase-explorer';

// ❌ Avoid long paths
import { FileTree } from '@/components/codebase-explorer/FileTree';
```

## State Management Workflow

### Creating a New Feature Store

1. Define types dan interfaces
2. Create store dengan Zustand
3. Export store dan type definitions
4. Use dalam components

```typescript
// src/stores/new-feature.store.ts
import { create } from 'zustand';

export interface FeatureData {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

interface FeatureState {
  items: FeatureData[];
  selectedId: string | null;
  loading: boolean;
  
  setItems: (items: FeatureData[]) => void;
  addItem: (item: FeatureData) => void;
  removeItem: (id: string) => void;
  setSelectedId: (id: string | null) => void;
}

export const useFeatureStore = create<FeatureState>((set) => ({
  items: [],
  selectedId: null,
  loading: false,

  setItems: (items) => set({ items }),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  removeItem: (id) => set((state) => ({
    items: state.items.filter((i) => i.id !== id),
  })),
  setSelectedId: (id) => set({ selectedId: id }),
}));
```

### Using Stores in Components

```typescript
// src/components/features/FeatureList.tsx
'use client';

import { useFeatureStore } from '@/stores/new-feature.store';
import { useShallow } from 'zustand/react/shallow';

export function FeatureList() {
  // ✅ Subscribe only to needed state
  const { items, selectedId, setSelectedId } = useFeatureStore(
    useShallow((state) => ({
      items: state.items,
      selectedId: state.selectedId,
      setSelectedId: state.setSelectedId,
    }))
  );

  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.id}
          onClick={() => setSelectedId(item.id)}
          className={selectedId === item.id ? 'bg-neon-cyan/20' : ''}
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

## Styling Workflow

### When Adding New Styles

1. Check if pattern exists di `tailwind-theme-guide.md`
2. Use existing color tokens dan shadows
3. Compound classes untuk readability
4. Add custom config ke `tailwind.config.ts` jika perlu

### Color Usage Rules

```typescript
// ✅ Primary accent - user interaction
<button className="border border-neon-cyan text-neon-cyan">Click me</button>

// ✅ Success state
<span className="text-neon-green">Success</span>

// ✅ Error/Alert
<div className="bg-neon-red/5 text-neon-red">Alert</div>

// ✅ Secondary accent
<div className="border-neon-purple">Secondary</div>

// ✅ Dark backgrounds
<div className="bg-blueprint-900">Content</div>

// ❌ DON'T use arbitrary colors
<div className="bg-[#ff6b6b]">Wrong</div>
```

### Responsive Patterns

```typescript
// Mobile-first approach
<div className="
  grid grid-cols-1              // Mobile: 1 column
  sm:grid-cols-2                // Tablet: 2 columns
  lg:grid-cols-3 xl:grid-cols-4 // Desktop: 3-4 columns
  gap-4 md:gap-6 lg:gap-8       // Responsive gap
">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

## Git & Version Control Workflow

### Branch Naming Convention

```
feature/feature-name              # New feature
fix/bug-description               # Bug fix
docs/update-description           # Documentation
refactor/improvement-description  # Code improvement
perf/optimization-description     # Performance
chore/task-description            # Maintenance
```

### Commit Message Format

```
# Format: <type>: <description>
# Types: feat, fix, docs, style, refactor, test, chore

feat: add voice input recognition component
fix: resolve state sync issue in debugger store
docs: update component development guidelines
refactor: simplify graph rendering logic
perf: optimize file tree rendering with virtualization
```

### Creating a Feature Branch

```bash
# Create and checkout feature branch
git checkout -b feature/codebase-analysis

# Make changes and commit
git add .
git commit -m "feat: add codebase structure analyzer"

# Push to remote
git push -u origin feature/codebase-analysis

# Create Pull Request via GitHub UI
```

## Code Review Checklist

Before submitting PR, verify:

- [ ] TypeScript types are explicit
- [ ] Props and function parameters have proper types
- [ ] No `any` types unless absolutely necessary
- [ ] Component follows established patterns
- [ ] Styling uses design tokens from theme
- [ ] Zustand store actions are immutable
- [ ] No console logs left in code
- [ ] Responsive design tested (mobile, tablet, desktop)
- [ ] Accessibility: keyboard navigation, ARIA labels
- [ ] Error handling implemented
- [ ] Performance: no unnecessary re-renders
- [ ] Documentation comments added for complex logic

## Testing Strategy

### Unit Tests (Component Logic)

```typescript
// src/components/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', async () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await userEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalled();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByText('Click')).toBeDisabled();
  });
});
```

### Store Tests

```typescript
// src/stores/__tests__/codebase.store.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCodebaseStore } from '../codebase.store';

describe('useCodebaseStore', () => {
  beforeEach(() => {
    useCodebaseStore.setState({
      files: [],
      selectedFile: null,
      analysisResult: null,
    });
  });

  it('adds a file to the store', () => {
    const { result } = renderHook(() => useCodebaseStore());

    act(() => {
      result.current.setFiles([{ id: '1', name: 'test.ts', path: '/', type: 'file' }]);
    });

    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].name).toBe('test.ts');
  });
});
```

### E2E Tests (User Workflows)

```typescript
// e2e/codebase-explorer.spec.ts
import { test, expect } from '@playwright/test';

test('user can explore codebase structure', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Select a file
  await page.click('[data-testid="file-tree-item-1"]');
  
  // Verify file is selected
  await expect(page.locator('[data-testid="file-details"]')).toContainText('test.ts');
  
  // Check graph visualization loaded
  await expect(page.locator('canvas')).toBeVisible();
});
```

## Performance Optimization

### React Performance

```typescript
// ✅ Memoize expensive components
import { memo } from 'react';

export const MemoizedNode = memo(function Node({ data }: NodeProps) {
  return <div>{data.label}</div>;
});

// ✅ Use useCallback for handlers
const handleClick = useCallback(() => {
  setSelectedId(id);
}, [id]);

// ✅ Use useMemo for expensive computations
const filteredItems = useMemo(
  () => items.filter(item => item.status === 'active'),
  [items]
);
```

### Zustand Performance

```typescript
// ✅ Subscribe selectively
const selectedFile = useCodebaseStore((state) => state.selectedFile);

// ❌ Subscribe to entire store
const state = useCodebaseStore();
```

### Build Performance

```bash
# Analyze bundle size
npm run build

# Check tree-shaking with build output
# Ensure no unused dependencies imported
```

## Debugging Techniques

### React DevTools

```typescript
// Use displayName untuk easier debugging
ExampleComponent.displayName = 'ExampleComponent';

// Trace render causes
import { Profiler } from 'react';

<Profiler id="example" onRender={logRender}>
  <ExampleComponent />
</Profiler>
```

### Store Debugging

```typescript
// Subscribe to all store changes
useCodebaseStore.subscribe(
  (state) => console.log('Store updated:', state),
);

// Monitor specific state changes
useCodebaseStore.subscribe(
  (state) => state.selectedFile,
  (selectedFile) => console.log('File selected:', selectedFile),
);
```

### Browser DevTools

- React DevTools: Inspect component tree, props, hooks
- Lighthouse: Performance, accessibility, best practices
- Network tab: Check bundle sizes, API calls
- Console: Check for errors and warnings

## Common Patterns & Recipes

### Loading State Pattern

```typescript
const { data, loading, error } = useStore();

if (loading) return <LoadingSpinner />;
if (error) return <ErrorAlert message={error} />;
return <DataDisplay data={data} />;
```

### Optimistic Update Pattern

```typescript
const handleUpdate = async (id: string, newData: Data) => {
  // Update UI immediately
  updateLocal(id, newData);
  
  try {
    // Then sync with server
    await api.update(id, newData);
  } catch (error) {
    // Revert if failed
    revertLocal(id);
    showError(error);
  }
};
```

### Debounced Search Pattern

```typescript
import { useCallback } from 'react';
import { debounce } from 'lodash-es';

const handleSearch = useCallback(
  debounce((query: string) => {
    searchStore.search(query);
  }, 300),
  [],
);

<input onChange={(e) => handleSearch(e.target.value)} />
```

## Documentation Standards

### Component Documentation

```typescript
/**
 * FileTree Component
 * 
 * Renders a hierarchical view of files and directories from the codebase.
 * Supports selection, filtering, and lazy-loading for large codebases.
 * 
 * @component
 * @example
 * ```tsx
 * <FileTree
 *   files={codebaseFiles}
 *   onSelect={(file) => console.log(file)}
 *   searchQuery="component"
 * />
 * ```
 * 
 * @props {FileNode[]} files - Array of file nodes to display
 * @props {(file: FileNode) => void} onSelect - Callback when file selected
 * @props {string} [searchQuery] - Filter files by query string
 * @props {boolean} [isLoading] - Show loading state
 * 
 * @returns {JSX.Element} File tree component
 */
export function FileTree({ files, onSelect, searchQuery, isLoading }: FileTreeProps) {
  // Implementation
}
```

### Store Documentation

```typescript
/**
 * Codebase Analysis Store
 * 
 * Manages state for codebase exploration including:
 * - File tree structure
 * - Analysis results
 * - Selected files and folders
 * 
 * Usage:
 * ```tsx
 * const { files, analyze } = useCodebaseStore();
 * ```
 */
```

## Troubleshooting

### Common Issues & Solutions

**Issue**: Styles not applying
- Clear `.next` folder: `rm -rf .next`
- Rebuild: `npm run build`
- Check Tailwind config content paths

**Issue**: Zustand state not updating
- Verify immutability in setter functions
- Check component subscription to store
- Use React DevTools to inspect store state

**Issue**: React Flow not rendering
- Ensure parent has defined height
- Check nodes/edges data structure
- Verify keys are unique

**Issue**: TypeScript errors
- Run type checker: `tsc --noEmit`
- Check tsconfig.json settings
- Ensure all imports are typed

---

## Quick Reference

### Essential Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
npm test         # Run tests
npm run type-check  # TypeScript type checking
```

### Project Structure Quick Access

```
Source: src/
  ├── app/          Next.js pages & routes
  ├── components/   React components
  ├── stores/       Zustand state stores
  ├── hooks/        Custom React hooks
  └── lib/          Utilities & helpers

Tests: src/__tests__/
Config: Root level (tsconfig, tailwind.config, etc)
```

---

**Last Updated**: November 2026
**Status**: Production Ready
