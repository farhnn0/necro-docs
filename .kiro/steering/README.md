# Necro-Docs: Steering Documentation Guide

Welcome to the Necro-Docs steering documentation. **Start with `current-architecture.md`** for the current implementation contract. The older guides remain useful for patterns and examples, but current architecture, analyzer coverage, graph scope, and PR behavior are defined there.

Necro-Docs is an AI Codebase Archaeologist & Interactive Voice Debugger for the Kiroween Hackathon (Frankenstein Category).

## 0. **current-architecture.md** - Current Product and Engineering Contract

**Read this first.** It reflects the shipped application rather than the original MVP examples.

It covers:
- GitHub ingestion up to the current safety budget
- Static analysis for all analyzed files and AI explanations for featured files
- TypeScript/JavaScript AST context scanning
- Key files, revealed files, and all-files graph scope
- Search debounce and progressive graph reveal
- Voice Séance and normalized TTS
- Surgical Patch and GitHub Pull Request workflow
- Current security, accessibility, testing, and build rules

If an older guide conflicts with this file, follow `current-architecture.md`.
## Documentation Files

### 1. **necro-docs-guide.md** - Project Overview & Architecture
The master guide covering project vision, tech stack, and directory structure.

**Key Sections**:
- Project overview and core features
- Complete tech stack breakdown
- Directory structure with explanations
- Styling guidelines overview
- Component development standards
- State management patterns
- Development workflow
- Key considerations (server vs client, performance, accessibility, types)
- Feature implementation checklist
- Debugging & troubleshooting

**Start Here** for understanding the project holistically.

---

### 2. **tailwind-theme-guide.md** - Styling & Design System
Detailed Tailwind CSS configuration and component styling patterns for the cyber-gothic theme.

**Key Sections**:
- Dark cyber-gothic anatomical blueprint theme
- Color system (Primary navy, neon accents, neutrals)
- Tailwind configuration setup
- Component styling patterns (Cards, Buttons, Inputs, Badges, Alerts, Code blocks)
- Layout patterns
- Text styling conventions
- Interactive states (Hover, Focus, Active)
- Animation guidelines (Pulse, Flicker, Scan line)
- Responsive design patterns
- Performance considerations

**Use this** when building UI components or styling new features.

**Color Quick Reference**:
```
Primary (Blueprint):    #0a0e27 - #3d51a0
Neon Accents:           Cyan (#00d9ff), Green (#00ff88), Purple (#c700ff), Red (#ff0040)
Neutrals:               Bone (#e8e8e8), Ghost (#a0a0a0)
```

---

### 3. **state-and-visualization.md** - State Management & React Flow
Comprehensive guide for Zustand store patterns and React Flow node graph visualization.

**Key Sections**:
- Zustand store architecture (4 core stores)
  - Codebase Store (file exploration)
  - Debugger Store (breakpoints, logs, traces)
  - Graph Store (node/edge management)
  - UI Store (modals, panels, notifications)
- React Flow integration with custom nodes/edges
- Store usage patterns in components
- Performance optimization tips
- Store testing examples
- Memoization and subscription strategies

**Use this** when:
- Creating new stores or modifying existing ones
- Working with React Flow visualizations
- Optimizing store subscriptions
- Testing store logic

**Store Structure**:
```
Separate stores per domain → Each store manages one feature area
Immutable updates → All setters create new objects
Selective subscriptions → Components subscribe only to needed state
```

---

### 4. **development-workflow.md** - Development Practices & Standards
Best practices, patterns, and workflow guidelines for day-to-day development.

**Key Sections**:
- Project setup and initialization
- TypeScript & strict mode requirements
- Component file organization and structure
- Barrel exports pattern
- State management workflow
- Styling workflow and color rules
- Git workflow (branches, commits, PRs)
- Code review checklist
- Testing strategy (unit, store, E2E)
- Performance optimization patterns
- Debugging techniques and tools
- Common patterns and recipes
- Documentation standards
- Troubleshooting common issues

**Use this** during active development as your daily reference.

**Key Reminders**:
- ✅ Explicit types everywhere
- ✅ Immutable state updates
- ✅ Selective store subscriptions
- ✅ Semantic HTML
- ✅ Component documentation
- ❌ No arbitrary colors (use design tokens)
- ❌ No implicit `any` types
- ❌ No console logs in production

---

### 5. **api-integration-guide.md** - API Routes & Backend Patterns
Guide for implementing Next.js API routes and client-side API integration.

**Key Sections**:
- API architecture and route structure
- Standard response formats (`ApiResponse<T>`)
- Route implementation templates
- Authentication patterns
- Pagination handling
- Client-side fetch service pattern
- Zustand + API integration
- Error handling and boundaries
- Data caching strategies
- Rate limiting and throttling
- Environment configuration
- API route testing
- Best practices and patterns

**Use this** when:
- Creating new API endpoints
- Integrating API calls with store
- Implementing error handling
- Setting up caching
- Testing API routes

**Response Format**:
```typescript
{
  success: boolean;
  data?: T;
  error?: { code, message, details };
  meta?: { timestamp, duration };
}
```

---

## 🎯 Quick Start by Task

### I want to...

**...build a new component**
1. Read: `development-workflow.md` → Component Structure section
2. Reference: `tailwind-theme-guide.md` → Component Styling Patterns
3. Follow: `necro-docs-guide.md` → Directory structure

**...add styling to a component**
1. Check: `tailwind-theme-guide.md` → Component Styling Patterns
2. Use: Color tokens from Color System section
3. Follow: Responsive patterns

**...create a new feature with state management**
1. Plan: Store architecture in `state-and-visualization.md`
2. Implement: Following Zustand patterns from that guide
3. Use: API integration from `api-integration-guide.md` if needed
4. Test: Patterns from `development-workflow.md`

**...work with data visualization**
1. Reference: `state-and-visualization.md` → React Flow Integration
2. Check: Custom node/edge examples
3. Use: Graph store patterns

**...create an API endpoint**
1. Reference: `api-integration-guide.md` → API Route Implementation
2. Follow: Templates and response formats
3. Test: Using test examples provided

**...debug an issue**
1. Check: `development-workflow.md` → Debugging Techniques
2. Reference: `necro-docs-guide.md` → Debugging & Troubleshooting
3. Use: Browser DevTools patterns

---

## 🏗️ Project Structure at a Glance

```
necro-docs/
├── src/
│   ├── app/                    # Next.js App Router pages
│   ├── components/             # React components (organized by feature)
│   ├── stores/                 # Zustand stores
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities, types, API client
│   └── styles/                 # Global styles & theme
├── .kiro/
│   └── steering/               # This documentation (you are here!)
├── public/                     # Static assets
├── package.json                # Dependencies
├── tailwind.config.ts          # Tailwind configuration
├── tsconfig.json               # TypeScript configuration
└── next.config.ts              # Next.js configuration
```

---

## 🛠️ Essential Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # Run ESLint
npm test                 # Run test suite
npm run type-check       # TypeScript type checking

# Utilities
npm list next            # Check Next.js version
npm list                 # Check all packages
```

---

## 🎨 Design System Quick Reference

### Colors
- **Primary Accent**: `text-neon-cyan` for interactive elements
- **Success**: `text-neon-green`
- **Error**: `text-neon-red`
- **Secondary**: `text-neon-purple`
- **Text**: `text-bone` (primary), `text-ghost` (secondary)
- **Background**: `bg-blueprint-900`, `bg-blueprint-950`

### Shadows & Glows
- **Small glow**: `shadow-glow-sm`
- **Medium glow**: `shadow-glow-md`
- **Large glow**: `shadow-glow-lg`
- **Neon shadows**: `shadow-neon-cyan`, `shadow-neon-green`, etc.

### Animations
- **Pulse effect**: `animate-pulse-cyan`
- **Glitch effect**: `animate-flicker`
- **Scan lines**: `animate-scan-line`

### Typography
- **Sans**: Geist Sans (variable)
- **Mono**: Geist Mono (for code)
- **Leading**: Default line-height adjusted for readability

---

## 🔄 Development Workflow Summary

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/feature-name
   ```

2. **Implement Feature**
   - Follow component patterns from `development-workflow.md`
   - Use styling from `tailwind-theme-guide.md`
   - Manage state with patterns from `state-and-visualization.md`
   - Integrate APIs using `api-integration-guide.md`

3. **Test & Debug**
   - Unit tests for components
   - Store tests for state
   - Use debugging techniques from `development-workflow.md`

4. **Code Review Checklist**
   - [ ] Types are explicit
   - [ ] No `any` types
   - [ ] Immutable state
   - [ ] Using design tokens
   - [ ] Responsive design
   - [ ] Accessibility
   - [ ] Error handling
   - [ ] Documentation

5. **Commit & Push**
   ```bash
   git commit -m "feat: descriptive message"
   git push -u origin feature/feature-name
   ```

6. **Create Pull Request**
   - Use GitHub UI
   - Reference the checklist above

---

## 📋 Feature Implementation Checklist

### Phase 1: Foundation
- [ ] Next.js App Router structure
- [ ] Tailwind theme configuration
- [ ] Base UI components (Button, Card, Modal)
- [ ] Zustand store setup

### Phase 2: Codebase Explorer
- [ ] File tree component
- [ ] Structure analysis engine
- [ ] Dependency graph visualization
- [ ] React Flow integration

### Phase 3: Voice Debugger
- [ ] Voice input component
- [ ] Speech recognition integration
- [ ] Debug console renderer
- [ ] Execution tracer

### Phase 4: Polish & Deploy
- [ ] Dark mode animations
- [ ] Performance optimization
- [ ] Error handling
- [ ] Production deployment

---

## 🚀 Deployment Considerations

Before deploying to production:
1. Run full test suite
2. Check bundle size with `npm run build`
3. Verify all environment variables in `.env.production`
4. Test on multiple devices (mobile, tablet, desktop)
5. Run Lighthouse audit
6. Check accessibility compliance

---

## 📖 Documentation Conventions

All documentation uses:
- **✅ DO** examples (recommended patterns)
- **❌ DON'T** examples (anti-patterns)
- **Code blocks** with language highlighting
- **Type hints** in all TypeScript examples
- **Cross-references** between related sections

---

## 🤝 Team Guidelines

### Code Review Focus Areas
1. **Type Safety**: Are types explicit and correct?
2. **Immutability**: Are store updates immutable?
3. **Performance**: Are there unnecessary re-renders?
4. **Accessibility**: Is the component keyboard accessible?
5. **Documentation**: Is complex logic documented?

### Collaboration
- Follow commit message format: `type: description`
- Use meaningful branch names
- Keep PRs focused and reviewable
- Document decision-making in comments

---

## ❓ FAQ

**Q: Where do I put a new component?**
A: In `src/components/` organized by feature. See `development-workflow.md` → File Organization.

**Q: How do I manage component state?**
A: Use Zustand stores for global state. See `state-and-visualization.md` for patterns.

**Q: What colors should I use?**
A: Use predefined tokens from `tailwind-theme-guide.md`. Never use arbitrary colors.

**Q: How do I call an API?**
A: Use the fetch service from `api-integration-guide.md` and integrate with Zustand stores.

**Q: Where should I test?**
A: Unit tests in `__tests__` folders. See examples in `development-workflow.md`.

**Q: How do I debug store state?**
A: Use subscribe pattern or React DevTools. See `development-workflow.md` → Debugging Techniques.

---

## 📞 Getting Help

If you're stuck:
1. **Check the relevant guide** (links above)
2. **Look for examples** in the guide
3. **Check troubleshooting** sections
4. **Use browser DevTools** (React DevTools, Network tab, Console)
5. **Ask the team** with specific context

---

## 📝 Last Updated

- **Date**: November 2026
- **Status**: Production Ready
- **Next Review**: After hackathon completion

---

## 🎓 Learning Path

**For New Team Members**:
1. Start with `necro-docs-guide.md` (project overview)
2. Read `tailwind-theme-guide.md` (understand the design system)
3. Study `state-and-visualization.md` (core architecture)
4. Review `development-workflow.md` (daily practices)
5. Reference `api-integration-guide.md` (as needed)

**For Designers/UI Contributors**:
- Focus on `tailwind-theme-guide.md`
- Reference color system and component patterns
- Follow responsive design guidelines

**For Backend/API Contributors**:
- Study `api-integration-guide.md`
- Reference patterns from `development-workflow.md`
- Coordinate with frontend team on data formats

**For Full-Stack Contributors**:
- Read all guides in order
- Focus on integration between sections
- Own both frontend and backend responsibilities

---

Selamat mengembangkan Necro-Docs! Semoga dokumentasi ini membantu dalam proses development. Jika ada pertanyaan atau clarification needed, hubungi tim development.

**Happy coding! 🧟‍♂️💀**
