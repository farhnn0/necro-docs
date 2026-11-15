# Necro-Docs: Quick Reference & Navigation

Panduan cepat untuk menemukan informasi yang Anda butuhkan dalam dokumentasi Necro-Docs.

## 📖 Documentation Map

### By Topic

#### 🏗️ Architecture & Setup
- **Project Overview**: `necro-docs-guide.md` → Project Overview
- **Tech Stack**: `necro-docs-guide.md` → Tech Stack
- **Directory Structure**: `necro-docs-guide.md` → Directory Structure
- **Initial Setup**: `development-workflow.md` → Project Setup & Initialization

#### 🎨 Styling & Design
- **Color System**: `tailwind-theme-guide.md` → Color System
- **Tailwind Config**: `tailwind-theme-guide.md` → Tailwind Custom Configuration
- **Component Patterns**: `tailwind-theme-guide.md` → Component Styling Patterns
- **Responsive Design**: `tailwind-theme-guide.md` → Responsive Design
- **Animations**: `tailwind-theme-guide.md` → Animation Guidelines

#### 🧩 Components
- **Component Structure**: `development-workflow.md` → Component Structure
- **Barrel Exports**: `development-workflow.md` → Barrel Exports
- **File Organization**: `development-workflow.md` → File Organization
- **Component Documentation**: `development-workflow.md` → Documentation Standards

#### 🔄 State Management
- **Zustand Stores**: `state-and-visualization.md` → Store Architecture
- **Codebase Store**: `state-and-visualization.md` → Codebase Store
- **Debugger Store**: `state-and-visualization.md` → Debugger Store
- **Graph Store**: `state-and-visualization.md` → Graph Store
- **UI Store**: `state-and-visualization.md` → UI Store
- **Store Patterns**: `state-and-visualization.md` → Store Usage Patterns

#### 📊 Visualization
- **React Flow**: `state-and-visualization.md` → React Flow Integration
- **Custom Nodes**: `state-and-visualization.md` → Custom Nodes
- **Custom Edges**: `state-and-visualization.md` → Custom Edges
- **Graph Performance**: `state-and-visualization.md` → Performance Tips

#### 🌐 API & Backend
- **API Structure**: `api-integration-guide.md` → API Architecture Overview
- **API Routes**: `api-integration-guide.md` → API Route Implementation
- **Response Format**: `api-integration-guide.md` → API Response Patterns
- **Client-Side Calls**: `api-integration-guide.md` → Client-Side API Calls
- **Error Handling**: `api-integration-guide.md` → Error Handling Strategy
- **Caching**: `api-integration-guide.md` → Data Caching Strategy

#### 🛠️ Types & Utilities
- **Shared Types**: `types-and-utilities.md` → Shared Types Structure
- **Constants**: `types-and-utilities.md` → Constants & Configuration
- **Utility Functions**: `types-and-utilities.md` → Utility Functions
- **Type Guards**: `types-and-utilities.md` → Type Guards

#### 📝 Development Practices
- **Git Workflow**: `development-workflow.md` → Git & Version Control Workflow
- **Code Review**: `development-workflow.md` → Code Review Checklist
- **Testing**: `development-workflow.md` → Testing Strategy
- **Performance**: `development-workflow.md` → Performance Optimization
- **Debugging**: `development-workflow.md` → Debugging Techniques

---

## 🎯 Common Tasks & Where to Find Help

### Building UI
**Task**: Create a new button component
1. Read: `development-workflow.md` → Component Structure
2. Reference: `tailwind-theme-guide.md` → Button Component (Primary - Neon Cyan)
3. Check: `types-and-utilities.md` → Utility Functions (classNames)

**Task**: Style a card component
1. Check: `tailwind-theme-guide.md` → Card Component (Dark with Glow)
2. Use colors from: `tailwind-theme-guide.md` → Color System
3. Reference responsive: `tailwind-theme-guide.md` → Responsive Design

### State Management
**Task**: Create a new Zustand store
1. Read: `state-and-visualization.md` → Store Architecture
2. Follow pattern from: `state-and-visualization.md` → Codebase Store
3. Use in component: `state-and-visualization.md` → Store Usage Patterns

**Task**: Subscribe to store changes
1. Reference: `state-and-visualization.md` → Store Usage Patterns
2. Optimization tips: `state-and-visualization.md` → Performance Tips

### API Integration
**Task**: Create a new API endpoint
1. Reference: `api-integration-guide.md` → API Route Implementation
2. Use template: `api-integration-guide.md` → Basic Route Template
3. Error handling: `api-integration-guide.md` → Error Handling Strategy

**Task**: Call API from component
1. Setup: `api-integration-guide.md` → Fetch Service Pattern
2. Integrate with store: `api-integration-guide.md` → Using API with Zustand
3. In component: `api-integration-guide.md` → Using API in Components

### Data Visualization
**Task**: Add React Flow visualization
1. Learn: `state-and-visualization.md` → React Flow Integration
2. Custom node: `state-and-visualization.md` → Custom Nodes
3. Custom edge: `state-and-visualization.md` → Custom Edges

### Types & Constants
**Task**: Add a new type definition
1. Location: `types-and-utilities.md` → Shared Types Structure
2. Example: `types-and-utilities.md` → Core Types
3. Usage: `types-and-utilities.md` → Usage Examples

**Task**: Add a new constant
1. Location: `types-and-utilities.md` → Constants & Configuration
2. Examples: `types-and-utilities.md` → Constants & Configuration (various sections)

### Testing
**Task**: Write unit tests for component
1. Reference: `development-workflow.md` → Unit Tests (Component Logic)
2. Setup: `development-workflow.md` → Testing Strategy

**Task**: Write tests for stores
1. Reference: `development-workflow.md` → Store Tests
2. Example: `state-and-visualization.md` → Testing Stores

### Debugging
**Task**: Debug store state issue
1. Tools: `development-workflow.md` → Store Debugging
2. Browser tools: `development-workflow.md` → Browser DevTools
3. Common issues: `development-workflow.md` → Troubleshooting

**Task**: Fix styling issue
1. Troubleshoot: `development-workflow.md` → Troubleshooting
2. Check: `tailwind-theme-guide.md` → Dark Mode Optimization

---

## 🚀 By Experience Level

### 👶 First Time? Start Here
1. **necro-docs-guide.md** - Get the big picture
2. **tailwind-theme-guide.md** - Understand the design system
3. **development-workflow.md** - Learn daily practices
4. **state-and-visualization.md** - Understand state management
5. **api-integration-guide.md** - Learn backend patterns

### 🎯 Ready to Build?
- Component: `development-workflow.md` → Component Structure
- Store: `state-and-visualization.md` → Store Architecture
- API: `api-integration-guide.md` → API Route Implementation
- Styling: `tailwind-theme-guide.md` → Component Styling Patterns

### 🔍 Debugging Something?
- Check: `development-workflow.md` → Troubleshooting
- Tools: `development-workflow.md` → Debugging Techniques
- Common issues: `necro-docs-guide.md` → Debugging & Troubleshooting

### ⚡ Optimize Performance?
- React: `development-workflow.md` → React Performance
- Zustand: `development-workflow.md` → Zustand Performance
- Build: `development-workflow.md` → Build Performance
- Graph: `state-and-visualization.md` → Performance Tips

---

## 🔗 Key File Locations in Project

### Source Files
```
src/
├── lib/types.ts              → Shared types (start here for types)
├── lib/constants.ts          → Shared constants
├── lib/utils.ts              → Utility functions
├── lib/api/client.ts         → API client (see api-integration-guide.md)
├── stores/                   → See state-and-visualization.md
│   ├── codebase.store.ts
│   ├── debugger.store.ts
│   ├── graph.store.ts
│   └── ui.store.ts
├── components/               → See development-workflow.md → File Organization
│   ├── ui/
│   ├── codebase-explorer/
│   ├── voice-debugger/
│   └── node-graph/
└── app/api/                  → See api-integration-guide.md
    ├── codebase/
    ├── debugger/
    └── voice/
```

### Configuration Files
```
tailwind.config.ts           → See tailwind-theme-guide.md
tsconfig.json                → TypeScript config
next.config.ts               → Next.js config
package.json                 → Dependencies
```

---

## 📋 Copy-Paste Templates

### Component Template
See: `development-workflow.md` → Component Structure

### Store Template
See: `state-and-visualization.md` → Codebase Store

### API Route Template
See: `api-integration-guide.md` → Basic Route Template

### API Client Template
See: `api-integration-guide.md` → Fetch Service Pattern

---

## 🎨 Design Tokens Quick Copy

### Colors (Tailwind Classes)
```
Backgrounds:    bg-blueprint-900, bg-blueprint-800, bg-blueprint-700
Text Primary:   text-bone
Text Secondary: text-ghost
Accent Cyan:    text-neon-cyan, border-neon-cyan, shadow-neon-cyan
Accent Green:   text-neon-green
Accent Purple:  text-neon-purple
Accent Red:     text-neon-red
```

### Shadows (Tailwind Classes)
```
Small:   shadow-glow-sm
Medium:  shadow-glow-md
Large:   shadow-glow-lg
Cyan:    shadow-neon-cyan
Green:   shadow-neon-green
Purple:  shadow-neon-purple
Red:     shadow-neon-red
```

### Animations (Tailwind Classes)
```
Pulse:   animate-pulse-cyan
Glitch:  animate-flicker
Scan:    animate-scan-line
```

---

## 🔄 Common Commands

```bash
# Development
npm run dev                  # Start dev server
npm run build                # Build for production
npm run lint                 # Run ESLint
npm test                     # Run tests
npm run type-check           # Check types

# Git
git checkout -b feature/name # Create feature branch
git commit -m "feat: msg"    # Commit with type
git push -u origin branch    # Push new branch
```

---

## ⚠️ Common Mistakes to Avoid

1. **Using arbitrary colors** instead of design tokens
   - ❌ `bg-[#ff6b6b]`
   - ✅ `bg-neon-red`
   - See: `tailwind-theme-guide.md` → Color Usage Rules

2. **Implicit `any` types**
   - ❌ `function handle(data) { }`
   - ✅ `function handle(data: FileNode) { }`
   - See: `development-workflow.md` → TypeScript & Type Safety

3. **Mutable state updates**
   - ❌ `state.items.push(item)`
   - ✅ `[...state.items, item]`
   - See: `state-and-visualization.md` → Store Architecture

4. **Console logs in production**
   - ❌ `console.log('debug')`
   - ✅ Remove before commit
   - See: `development-workflow.md` → Code Review Checklist

5. **Subscribing to entire store**
   - ❌ `const state = useStore()`
   - ✅ `const field = useStore(s => s.field)`
   - See: `development-workflow.md` → Zustand Performance

---

## 📞 Need Help?

1. **Can't find something?** Use Ctrl+F to search within files
2. **Specific error?** Check `development-workflow.md` → Troubleshooting
3. **Design question?** See `tailwind-theme-guide.md`
4. **Architecture question?** See `necro-docs-guide.md`
5. **Still stuck?** Ask the team with specific context

---

## 📊 Documentation Stats

- **Total Files**: 8 markdown files
- **Total Sections**: 100+
- **Code Examples**: 150+
- **Patterns & Templates**: 50+
- **Last Updated**: November 2026

---

## 🎓 Learning Resources

### For Specific Technologies
- **Next.js**: `necro-docs-guide.md` → Tech Stack (link to docs)
- **React 19**: `necro-docs-guide.md` → Tech Stack (link to docs)
- **Zustand**: `state-and-visualization.md` → Store Architecture
- **React Flow**: `state-and-visualization.md` → React Flow Integration
- **Tailwind CSS**: `tailwind-theme-guide.md` → Tailwind Custom Configuration

### External Links in Docs
- React documentation: `development-workflow.md` → Resources
- Next.js documentation: `necro-docs-guide.md` → Resources
- Zustand docs: `state-and-visualization.md` → Resources
- React Flow docs: `state-and-visualization.md` → Resources

---

## ✅ Pre-Development Checklist

Before starting work:
- [ ] Read the relevant guide section
- [ ] Check if pattern/template exists
- [ ] Review code examples
- [ ] Understand error handling approach
- [ ] Plan testing strategy
- [ ] Consider accessibility
- [ ] Check performance implications

---

**Navigation Tip**: Bookmark this page! Use Ctrl+F to search for keywords.

**Last Updated**: November 2026
**Status**: Ready to Use
