import { create } from 'zustand';

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
  files: FileNode[];
  selectedFile: string | null;
  selectedFolder: string | null;
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;

  setFiles: (files: FileNode[]) => void;
  setSelectedFile: (id: string | null) => void;
  setSelectedFolder: (id: string | null) => void;
  analyze: (rootPath: string) => Promise<void>;
  updateFileMetadata: (fileId: string, metadata: any) => void;
  clearAnalysis: () => void;
}

export const useCodebaseStore = create<CodebaseState>((set) => ({
  files: [],
  selectedFile: null,
  selectedFolder: null,
  analysisResult: null,
  isAnalyzing: false,
  error: null,

  setFiles: (files) => set({ files }),
  
  setSelectedFile: (id) => set({ selectedFile: id }),
  
  setSelectedFolder: (id) => set({ selectedFolder: id }),
  
  analyze: async (rootPath) => {
    set({ isAnalyzing: true, error: null });
    try {
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
}));
