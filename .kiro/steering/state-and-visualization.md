# Necro-Docs: State Management & Visualization Guide

> Current implementation note: use `.kiro/steering/current-architecture.md` for the shipped graph, key/revealed/all scope, SVG layout, and floating inspector. The React Flow examples below are legacy patterns.

## Zustand State Management Patterns

### Store Architecture

Necro-Docs menggunakan Zustand dengan separation of concerns: setiap feature domain memiliki store tersendiri.

### 1. Codebase Store (codebase.store.ts)

Mengelola state untuk codebase analysis dan file exploration.

```typescript
// src/stores/codebase.store.ts
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/react';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  language?: string;
  children?: FileNode[];
  metadata?: {
    imports?: string[];
    exports?: string[];
    functions?: string[];
    classes?: string[];
  };
}

export interface AnalysisResult {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  dependencies: string[];
  architecture: 'monolithic' | 'modular' | 'microservices';
  complexity: 'low' | 'medium' | 'high';
  patterns: string[];
}

interface CodebaseState {
  // State
  files: FileNode[];
  selectedFile: string | null;
  selectedFolder: string | null;
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;

  // Actions
  setFiles: (files: FileNode[]) => void;
  setSelectedFile: (id: string | null) => void;
  setSelectedFolder: (id: string | null) => void;
  analyze: (rootPath: string) => Promise<void>;
  updateFileMetadata: (fileId: string, metadata: FileNode['metadata']) => void;
  clearAnalysis: () => void;
}

export const useCodebaseStore = create<CodebaseState>()(
  subscribeWithSelector((set) => ({
    // Initial state
    files: [],
    selectedFile: null,
    selectedFolder: null,
    analysisResult: null,
    isAnalyzing: false,
    error: null,

    // Actions
    setFiles: (files) => set({ files }),
    
    setSelectedFile: (id) => set({ selectedFile: id }),
    
    setSelectedFolder: (id) => set({ selectedFolder: id }),
    
    analyze: async (rootPath) => {
      set({ isAnalyzing: true, error: null });
      try {
        // Simulation: replace dengan actual API call
        const result: AnalysisResult = {
          totalFiles: 42,
          totalLines: 15000,
          languages: { TypeScript: 60, CSS: 25, JSON: 15 },
          dependencies: ['react', 'zustand', 'tailwindcss'],
          architecture: 'modular',
          complexity: 'medium',
          patterns: ['component-based', 'hooks', 'store-pattern'],
        };
        set({ analysisResult: result, isAnalyzing: false });
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          isAnalyzing: false 
        });
      }
    },
    
    updateFileMetadata: (fileId, metadata) =>
      set((state) => ({
        files: state.files.map((file) =>
          file.id === fileId ? { ...file, metadata } : file
        ),
      })),
    
    clearAnalysis: () =>
      set({
        files: [],
        selectedFile: null,
        selectedFolder: null,
        analysisResult: null,
        error: null,
      }),
  }))
);
```

### 2. Debugger Store (debugger.store.ts)

Mengelola state untuk voice debugger dan execution tracing.

```typescript
// src/stores/debugger.store.ts
import { create } from 'zustand';

export interface DebugPoint {
  id: string;
  fileId: string;
  line: number;
  condition?: string;
  enabled: boolean;
  hitCount: number;
}

export interface DebugLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, any>;
}

export interface ExecutionTrace {
  id: string;
  functionName: string;
  fileId: string;
  line: number;
  duration: number;
  callStack: string[];
  variables: Record<string, any>;
}

interface DebuggerState {
  // State
  debugPoints: DebugPoint[];
  debugLogs: DebugLog[];
  executionTraces: ExecutionTrace[];
  isRecording: boolean;
  currentBreakpoint: string | null;
  voiceInputActive: boolean;
  lastVoiceCommand: string | null;

  // Actions
  addDebugPoint: (point: Omit<DebugPoint, 'id' | 'hitCount'>) => void;
  removeDebugPoint: (id: string) => void;
  toggleDebugPoint: (id: string) => void;
  addDebugLog: (log: Omit<DebugLog, 'id'>) => void;
  addExecutionTrace: (trace: Omit<ExecutionTrace, 'id'>) => void;
  setRecording: (recording: boolean) => void;
  setCurrentBreakpoint: (id: string | null) => void;
  setVoiceInputActive: (active: boolean) => void;
  setLastVoiceCommand: (command: string | null) => void;
  clearLogs: () => void;
  clearTraces: () => void;
}

export const useDebuggerStore = create<DebuggerState>((set) => ({
  // Initial state
  debugPoints: [],
  debugLogs: [],
  executionTraces: [],
  isRecording: false,
  currentBreakpoint: null,
  voiceInputActive: false,
  lastVoiceCommand: null,

  // Actions
  addDebugPoint: (point) =>
    set((state) => ({
      debugPoints: [
        ...state.debugPoints,
        { ...point, id: Math.random().toString(36), hitCount: 0 },
      ],
    })),

  removeDebugPoint: (id) =>
    set((state) => ({
      debugPoints: state.debugPoints.filter((p) => p.id !== id),
    })),

  toggleDebugPoint: (id) =>
    set((state) => ({
      debugPoints: state.debugPoints.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    })),

  addDebugLog: (log) =>
    set((state) => ({
      debugLogs: [
        ...state.debugLogs,
        { ...log, id: Math.random().toString(36) },
      ].slice(-100), // Keep last 100 logs
    })),

  addExecutionTrace: (trace) =>
    set((state) => ({
      executionTraces: [
        ...state.executionTraces,
        { ...trace, id: Math.random().toString(36) },
      ].slice(-50), // Keep last 50 traces
    })),

  setRecording: (recording) => set({ isRecording: recording }),

  setCurrentBreakpoint: (id) => set({ currentBreakpoint: id }),

  setVoiceInputActive: (active) => set({ voiceInputActive: active }),

  setLastVoiceCommand: (command) => set({ lastVoiceCommand: command }),

  clearLogs: () => set({ debugLogs: [] }),

  clearTraces: () => set({ executionTraces: [] }),
}));
```

### 3. Graph Store (graph.store.ts)

Mengelola state untuk React Flow node graph visualization.

```typescript
// src/stores/graph.store.ts
import { create } from 'zustand';
import { Node, Edge } from 'reactflow';

export type GraphNodeType = 'file' | 'component' | 'function' | 'dependency';

export interface GraphNodeData {
  label: string;
  type: GraphNodeType;
  fileId?: string;
  metadata?: Record<string, any>;
  highlighted?: boolean;
  selected?: boolean;
}

interface GraphState {
  // State
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
  selectedNodes: string[];
  layout: 'hierarchical' | 'circular' | 'force';
  zoom: number;
  panX: number;
  panY: number;

  // Actions
  setNodes: (nodes: Node<GraphNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node<GraphNodeData>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: Edge) => void;
  removeEdge: (id: string) => void;
  selectNode: (id: string, multi?: boolean) => void;
  deselectNode: (id: string) => void;
  clearSelection: () => void;
  setLayout: (layout: 'hierarchical' | 'circular' | 'force') => void;
  updateZoom: (zoom: number) => void;
  updatePan: (x: number, y: number) => void;
  highlightConnected: (nodeId: string) => void;
  clearHighlight: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  selectedNodes: [],
  layout: 'hierarchical',
  zoom: 1,
  panX: 0,
  panY: 0,

  // Actions
  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  addNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, node],
    })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    })),

  addEdge: (edge) =>
    set((state) => ({
      edges: [...state.edges, edge],
    })),

  removeEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    })),

  selectNode: (id, multi = false) =>
    set((state) => {
      const newSelected = multi
        ? state.selectedNodes.includes(id)
          ? state.selectedNodes.filter((n) => n !== id)
          : [...state.selectedNodes, id]
        : [id];

      return {
        selectedNodes: newSelected,
        nodes: state.nodes.map((n) => ({
          ...n,
          data: { ...n.data, selected: newSelected.includes(n.id) },
        })),
      };
    }),

  deselectNode: (id) =>
    set((state) => ({
      selectedNodes: state.selectedNodes.filter((n) => n !== id),
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, selected: false },
      })),
    })),

  clearSelection: () =>
    set((state) => ({
      selectedNodes: [],
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, selected: false },
      })),
    })),

  setLayout: (layout) => set({ layout }),

  updateZoom: (zoom) => set({ zoom }),

  updatePan: (x, y) => set({ panX: x, panY: y }),

  highlightConnected: (nodeId) =>
    set((state) => {
      const connectedIds = new Set<string>();
      connectedIds.add(nodeId);

      // Find directly connected nodes
      state.edges.forEach((edge) => {
        if (edge.source === nodeId) connectedIds.add(edge.target);
        if (edge.target === nodeId) connectedIds.add(edge.source);
      });

      return {
        nodes: state.nodes.map((n) => ({
          ...n,
          data: { ...n.data, highlighted: connectedIds.has(n.id) },
        })),
      };
    }),

  clearHighlight: () =>
    set((state) => ({
      nodes: state.nodes.map((n) => ({
        ...n,
        data: { ...n.data, highlighted: false },
      })),
    })),
}));
```

### 4. UI Store (ui.store.ts)

Mengelola state untuk UI interactions (modals, panels, notifications).

```typescript
// src/stores/ui.store.ts
import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface UIState {
  // Modals
  openModals: Set<string>;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;

  // Panels
  expandedPanels: Set<string>;
  togglePanel: (id: string) => void;
  expandPanel: (id: string) => void;
  collapsePanel: (id: string) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;

  // Theme & preferences
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Modals
  openModals: new Set(),
  openModal: (id) =>
    set((state) => ({
      openModals: new Set(state.openModals).add(id),
    })),
  closeModal: (id) =>
    set((state) => {
      const newModals = new Set(state.openModals);
      newModals.delete(id);
      return { openModals: newModals };
    }),
  closeAllModals: () => set({ openModals: new Set() }),

  // Panels
  expandedPanels: new Set(['explorer', 'graph']),
  togglePanel: (id) =>
    set((state) => {
      const newPanels = new Set(state.expandedPanels);
      if (newPanels.has(id)) {
        newPanels.delete(id);
      } else {
        newPanels.add(id);
      }
      return { expandedPanels: newPanels };
    }),
  expandPanel: (id) =>
    set((state) => ({
      expandedPanels: new Set(state.expandedPanels).add(id),
    })),
  collapsePanel: (id) =>
    set((state) => {
      const newPanels = new Set(state.expandedPanels);
      newPanels.delete(id);
      return { expandedPanels: newPanels };
    }),

  // Notifications
  notifications: [],
  addNotification: (notification) =>
    set((state) => {
      const id = Math.random().toString(36);
      const newNotifications = [...state.notifications, { ...notification, id }];
      
      // Auto-remove after duration
      if (notification.duration) {
        setTimeout(() => {
          set((s) => ({
            notifications: s.notifications.filter((n) => n.id !== id),
          }));
        }, notification.duration);
      }

      return { notifications: newNotifications };
    }),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  // Theme & preferences
  sidebarOpen: true,
  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  // Search
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
```

## React Flow Integration

### Custom Nodes

Buat custom node components yang sesuai dengan tema cyber-gothic.

```typescript
// src/components/node-graph/CustomNode.tsx
'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GraphNodeData } from '@/stores/graph.store';
import { Code2, FileCode, GitBranch, Package } from 'lucide-react';

const iconMap = {
  file: FileCode,
  component: Code2,
  function: GitBranch,
  dependency: Package,
};

export function CustomNode({ data, isConnecting, selected }: NodeProps<GraphNodeData>) {
  const Icon = iconMap[data.type];

  return (
    <div
      className={`
        px-4 py-3
        bg-gradient-to-br from-blueprint-800 via-blueprint-900 to-black
        border-2 rounded-lg
        transition-all duration-200
        ${
          selected
            ? 'border-neon-cyan shadow-neon-cyan'
            : 'border-ghost/30 shadow-glow-sm'
        }
        ${data.highlighted ? 'shadow-neon-purple' : ''}
        ${isConnecting ? 'opacity-50' : ''}
      `}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-neon-cyan" />
        <span className="text-xs font-mono text-neon-cyan uppercase tracking-wider">
          {data.type}
        </span>
      </div>

      <div className="text-sm font-medium text-bone mb-2">{data.label}</div>

      {data.metadata && (
        <div className="text-xs text-ghost/60 font-mono">
          {Object.entries(data.metadata)
            .slice(0, 2)
            .map(([key, value]) => (
              <div key={key}>
                {key}: {String(value).slice(0, 15)}...
              </div>
            ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
```

### Custom Edges

```typescript
// src/components/node-graph/CustomEdge.tsx
'use client';

import React from 'react';
import {
  EdgeProps,
  getStraightPath,
  BaseEdge,
} from 'reactflow';

export function CustomEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: selected ? '#00d9ff' : '#a0a0a0',
        strokeWidth: selected ? 3 : 2,
        filter: selected ? 'drop-shadow(0 0 10px #00d9ff)' : 'none',
        transition: 'all 0.2s ease',
      }}
    />
  );
}
```

## Store Usage Patterns

### In Components

```typescript
// src/components/codebase-explorer/FileTree.tsx
'use client';

import React, { useEffect } from 'react';
import { useCodebaseStore } from '@/stores/codebase.store';

export function FileTree() {
  const { files, selectedFile, setSelectedFile, analyze } = useCodebaseStore();

  useEffect(() => {
    // Analyze on mount
    analyze('/project');
  }, []);

  return (
    <div className="p-4">
      {files.map((file) => (
        <div
          key={file.id}
          onClick={() => setSelectedFile(file.id)}
          className={`
            p-2 rounded cursor-pointer transition-colors
            ${
              selectedFile === file.id
                ? 'bg-neon-cyan/20 text-neon-cyan'
                : 'text-ghost hover:text-bone'
            }
          `}
        >
          {file.name}
        </div>
      ))}
    </div>
  );
}
```

### Subscribing to Store Changes

```typescript
// Hook untuk track specific state
useEffect(() => {
  const unsubscribe = useCodebaseStore.subscribe(
    (state) => state.selectedFile,
    (selectedFile) => {
      console.log('File selected:', selectedFile);
    }
  );

  return unsubscribe;
}, []);
```

## Performance Tips

1. **Memoization**: Gunakan `useCallback` dan `useMemo` untuk optimize expensive operations
2. **Store Slicing**: Subscribe hanya ke state yang diperlukan
3. **Large Lists**: Implementasi virtualization untuk file trees dan debug logs
4. **Graph Rendering**: Lazy load large graphs, gunakan clustering untuk nodes
5. **Hydration**: Handle Zustand hydration pada Next.js dengan proper serialization

## Testing Stores

```typescript
// src/__tests__/stores/codebase.store.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCodebaseStore } from '@/stores/codebase.store';

describe('useCodebaseStore', () => {
  it('should analyze codebase', async () => {
    const { result } = renderHook(() => useCodebaseStore());

    await act(async () => {
      await result.current.analyze('/project');
    });

    expect(result.current.analysisResult).toBeDefined();
    expect(result.current.isAnalyzing).toBe(false);
  });
});
```

---

**Note**: Semua store mengikuti pattern Zustand yang sama. Jika menambahkan feature baru, buat store terpisah untuk domain itu dan follow pattern yang sudah ada.
