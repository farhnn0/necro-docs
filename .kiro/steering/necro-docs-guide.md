# Necro-Docs: AI Codebase Archaeologist & Interactive Voice Debugger

> Current implementation note: the authoritative architecture is `.kiro/steering/current-architecture.md`. This legacy guide contains background examples; follow the current guide when its examples differ.

**Project**: Necro-Docs (Kiroween Hackathon - Frankenstein Category)

**Tagline**: Resurrection of Legacy Code Through Intelligent Analysis & Voice-Guided Debugging

## Project Overview

Necro-Docs adalah platform interactive untuk menganalisis, memahami, dan debug codebases yang kompleks atau legacy. Menggunakan AI-powered codebase archaeologist untuk menggali struktur kode, dependencies, dan patterns, serta voice debugger interaktif untuk guidance real-time.

**Core Features**:
- 🧬 **Codebase Archaeology**: Analisis struktur dan dependensi codebase
- 🔊 **Interactive Voice Debugger**: Guidance debuggin berbasis suara
- 📊 **Visual Node Graph**: Visualisasi komponen dan relationship codebase
- 🌙 **Dark Cyber-Gothic UI**: Tema anatomical blueprint yang immersive

## Tech Stack

### Framework & Routing
- **Next.js**: v16.4.6 dengan App Router (bukan Pages Router)
- **React**: v19.3.0
- **TypeScript**: Strict mode

### Styling & UI
- **Tailwind CSS**: v4.3.3 dengan @tailwindcss/turbopack
- **Tema**: Dark cyber-gothic anatomical blueprint
  - Primary: Deep purples, dark cyans, bone whites
  - Accents: Neon greens, medical reds, electric blues
  - Pattern: Anatomical blueprints, code veins, circuit patterns

### State Management
- **Zustand**: v5.1.0 untuk sinkronisasi state global
- Pattern: Separate stores per feature domain
- Hydration: Perhatikan server/client boundary

### Visualization
- **React Flow**: v11.11.4 untuk node graph visualization
- **Lucide React**: v1.73.0 untuk icons

### Development
- **ESLint**: Dengan eslint-config-next
- **Turbopack**: Untuk build performance

## Directory Structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout dengan metadata
│   ├── globals.css          # Tailwind directives & theme vars
│   ├── page.tsx             # Homepage
│   ├── (explorer)/          # Route group untuk explorer
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── (debugger)/          # Route group untuk debugger
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── api/                 # API routes jika diperlukan
│
├── components/
│   ├── codebase-explorer/   # Feature: Codebase Analysis
│   │   ├── FileTree.tsx
│   │   ├── StructureGraph.tsx
│   │   └── DependencyAnalyzer.tsx
│   ├── voice-debugger/      # Feature: Voice Debugging
│   │   ├── VoiceInput.tsx
│   │   ├── DebugConsole.tsx
│   │   └── ExecutionTracer.tsx
│   ├── node-graph/          # Feature: Visualization
│   │   ├── CodeNodeGraph.tsx
│   │   ├── NodeRenderer.tsx
│   │   └── EdgeRenderer.tsx
│   ├── ui/                  # Shared UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   └── layout/              # Layout components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Footer.tsx
│
├── stores/                  # Zustand stores
│   ├── codebase.store.ts    # Codebase analysis state
│   ├── debugger.store.ts    # Debugger state
│   ├── graph.store.ts       # Node graph state
│   └── ui.store.ts          # UI state (theme, modals, etc)
│
├── hooks/                   # Custom React hooks
│   ├── useCodebaseAnalysis.ts
│   ├── useVoiceInput.ts
│   ├── useNodeGraph.ts
│   └── ...
│
├── lib/
│   ├── types.ts             # Shared TypeScript types
│   ├── constants.ts         # Constants & config
│   ├── utils.ts             # Utility functions
│   ├── codebase-parser/     # Codebase parsing logic
│   │   ├── parser.ts
│   │   └── analyzer.ts
│   ├── voice/               # Voice input/output logic
│   │   ├── recorder.ts
│   │   └── recognizer.ts
│   └── graph/               # Graph visualization logic
│       ├── layout.ts
│       └── transformer.ts
│
└── styles/                  # Global styles & themes
    ├── theme.css            # CSS variables untuk tema
    ├── animations.css       # Custom animations
    └── utilities.css        # Additional utilities
```

## Styling Guidelines

### Dark Cyber-Gothic Theme

#### Color Palette
```css
--color-primary-900: #0a0e27    /* Deep void */
--color-primary-800: #0f1a3d    /* Dark navy */
--color-primary-700: #1a2a5e    /* Blueprint navy */

--color-accent-cyan: #00d9ff    /* Neon cyan */
--color-accent-green: #00ff88   /* Neon green */
--color-accent-purple: #c700ff  /* Neon purple */
--color-accent-red: #ff0040     /* Medical red */

--color-bone: #e8e8e8          /* Bone white */
--color-ghost: #a0a0a0         /* Ghost grey */
```

#### Typography
- **Headings**: Geist Sans (variable font)
- **Body**: Geist Sans
- **Monospace**: Geist Mono (untuk code)
- **Letter Spacing**: Sedikit lebih lebar untuk teknologi aesthetic

#### Components Pattern
```tsx
// Dark card dengan glow effect
<div className="
  bg-gradient-to-br from-slate-900 via-slate-950 to-black
  border border-cyan-900/30
  rounded-lg
  shadow-lg shadow-cyan-500/10
  hover:shadow-cyan-500/20 transition-shadow
">
```

## Component Development Standards

### State Management Pattern

**Store (Zustand)**:
```typescript
// stores/codebase.store.ts
import { create } from 'zustand';

interface CodebaseState {
  files: FileNode[];
  selectedFile: string | null;
  analysisResult: AnalysisResult | null;
  setFiles: (files: FileNode[]) => void;
  setSelectedFile: (id: string) => void;
  analyze: (content: string) => Promise<void>;
}

export const useCodebaseStore = create<CodebaseState>((set) => ({
  files: [],
  selectedFile: null,
  analysisResult: null,
  setFiles: (files) => set({ files }),
  setSelectedFile: (id) => set({ selectedFile: id }),
  analyze: async (content) => {
    // Perform analysis
    set({ analysisResult: result });
  },
}));
```

**Component Usage**:
```typescript
export function CodebaseExplorer() {
  const { files, selectedFile, setSelectedFile } = useCodebaseStore();
  
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
```

### React Flow Integration

```typescript
// Nodes & Edges state dalam graph.store.ts
interface GraphState {
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
}

// Component Usage
export function CodeNodeGraph() {
  const { nodes, edges, setNodes, setEdges } = useGraphStore();
  const onNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes)),
    [nodes]
  );
  
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
    >
      {/* Flow components */}
    </ReactFlow>
  );
}
```

## Development Workflow

### 1. Running Development Server
```bash
npm run dev
```
Server berjalan di `http://localhost:3000`

### 2. TypeScript Checking
Pastikan strict mode di `tsconfig.json` dan type semua props dengan explicit.

### 3. Linting
```bash
npm run lint
```
Ikuti ESLint rules yang sudah dikonfigurasi.

### 4. Building
```bash
npm run build
npm start
```

## Key Considerations

### Server vs Client Components
- Use `'use client'` directive untuk components yang memerlukan interaktivity
- Keep server components untuk layout & data fetching
- Hydration: Zustand stores harus handle hydration dengan proper

### Performance
- Lazy load React Flow graphs ketika diperlukan
- Memoize expensive computations dalam stores
- Use React suspense untuk data fetching

### Accessibility
- Semantic HTML (button, nav, section, etc)
- ARIA labels untuk interactive elements
- Keyboard navigation support untuk graph nodes
- Voice debugger harus accessible via keyboard fallback

### Type Safety
```typescript
// Always explicit types
interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  metadata?: Record<string, any>;
}

// Export types dari lib/types.ts
export type { FileNode, AnalysisResult, VoiceCommand };
```

## Feature Implementation Checklist

### Phase 1: Foundation
- [ ] Setup Next.js App Router structure
- [ ] Configure Tailwind dengan tema cyber-gothic
- [ ] Create base UI components (Button, Card, Modal)
- [ ] Setup Zustand stores

### Phase 2: Codebase Explorer
- [ ] File tree component
- [ ] Structure analysis engine
- [ ] Dependency graph visualization
- [ ] Integration dengan React Flow

### Phase 3: Voice Debugger
- [ ] Voice input component
- [ ] Speech recognition integration
- [ ] Debug console renderer
- [ ] Execution tracer

### Phase 4: Polish & Deploy
- [ ] Dark mode animations
- [ ] Performance optimization
- [ ] Error handling & edge cases
- [ ] Deploy ke production

## Debugging & Troubleshooting

### Common Issues

**React Flow not rendering**:
- Pastikan parent container memiliki height tertentu
- Check node/edge data structure sesuai dengan React Flow spec
- Use React DevTools untuk inspect store state

**Zustand state tidak sync**:
- Verify store subscription di component
- Check untuk circular dependencies di stores
- Use Redux DevTools extension untuk debugging

**Styling tidak apply**:
- Clear `.next` folder dan rebuild
- Verify Tailwind config includes all content paths
- Check CSS specificity di global styles

## Resources & References

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Tailwind CSS 4](https://tailwindcss.com)
- [React Flow Documentation](https://reactflow.dev)
- [Zustand Documentation](https://github.com/pmndrs/zustand)

---

**Last Updated**: November 2026
**Maintained By**: Development Team
