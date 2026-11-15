# Necro-Docs: Tailwind Theme & Styling Guide

## Theme Configuration

### Dark Cyber-Gothic Anatomical Blueprint

Tema Necro-Docs menggabungkan dark mode dengan aesthetic cyber-gothic dan anatomical blueprint visuals.

## Color System

### Primary Colors (Blueprint Navy)
```
900: #0a0e27 - Deep void (backgrounds)
800: #0f1a3d - Dark navy (secondary bg)
700: #1a2a5e - Blueprint navy (tertiary bg)
600: #2d3f7f - Mid navy
```

### Neon Accent Colors
```
Cyan:    #00d9ff - Primary accent, glow effects
Green:   #00ff88 - Success, highlights
Purple:  #c700ff - Secondary accent, effects
Red:     #ff0040 - Alerts, danger
Blue:    #0080ff - Information
```

### Neutral Colors
```
Bone:    #e8e8e8 - Light text, highlights
Ghost:   #a0a0a0 - Secondary text
Slate:   #4a5568 - Borders, dividers
Black:   #000000 - Pure black for contrast
```

## Tailwind Custom Configuration

### Required tailwind.config file setup:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Blueprint Navy
        blueprint: {
          900: '#0a0e27',
          800: '#0f1a3d',
          700: '#1a2a5e',
          600: '#2d3f7f',
          500: '#3d51a0',
        },
        // Neon Accents
        neon: {
          cyan: '#00d9ff',
          green: '#00ff88',
          purple: '#c700ff',
          red: '#ff0040',
          blue: '#0080ff',
        },
        // Neutrals
        bone: '#e8e8e8',
        ghost: '#a0a0a0',
      },
      backgroundImage: {
        'gradient-to-br-dark':
          'linear-gradient(to bottom right, var(--tw-gradient-stops))',
        'circuit-pattern':
          'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0, 217, 255, 0.03) 10px, rgba(0, 217, 255, 0.03) 20px)',
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0, 217, 255, 0.5)',
        'neon-green': '0 0 20px rgba(0, 255, 136, 0.5)',
        'neon-purple': '0 0 20px rgba(199, 0, 255, 0.5)',
        'glow-sm': '0 0 10px rgba(0, 217, 255, 0.3)',
        'glow-md': '0 0 20px rgba(0, 217, 255, 0.4)',
        'glow-lg': '0 0 30px rgba(0, 217, 255, 0.5)',
      },
      animation: {
        'pulse-cyan': 'pulse-cyan 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'flicker 3s linear infinite',
        'scan-line': 'scan-line 8s linear infinite',
      },
      keyframes: {
        'pulse-cyan': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'flicker': {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.8' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
    },
  },
  plugins: [],
};

export default config;
```

## Component Styling Patterns

### Card Component (Dark with Glow)
```tsx
<div className="
  bg-gradient-to-br from-blueprint-800 via-blueprint-900 to-black
  border border-neon-cyan/20
  rounded-lg
  shadow-glow-md
  hover:shadow-glow-lg
  hover:border-neon-cyan/40
  transition-all duration-300
  p-4
">
  {/* Content */}
</div>
```

### Button Component (Primary - Neon Cyan)
```tsx
<button className="
  px-4 py-2
  bg-neon-cyan/10
  border border-neon-cyan/50
  text-neon-cyan
  rounded-lg
  hover:bg-neon-cyan/20
  hover:shadow-neon-cyan
  focus:outline-none
  focus:ring-2 focus:ring-neon-cyan/50
  transition-all duration-200
  font-medium
  uppercase tracking-wide
">
  Button Text
</button>
```

### Button Component (Secondary - Purple)
```tsx
<button className="
  px-4 py-2
  bg-neon-purple/10
  border border-neon-purple/50
  text-neon-purple
  rounded-lg
  hover:bg-neon-purple/20
  hover:shadow-neon-purple
  focus:outline-none
  focus:ring-2 focus:ring-neon-purple/50
  transition-all duration-200
  font-medium
">
  Secondary
</button>
```

### Input/Textarea Component
```tsx
<input className="
  w-full
  bg-blueprint-900/50
  border border-ghost/20
  text-bone
  rounded-lg
  px-3 py-2
  placeholder-ghost/40
  focus:outline-none
  focus:border-neon-cyan/50
  focus:ring-2 focus:ring-neon-cyan/20
  transition-all duration-200
  font-mono text-sm
  caret-neon-cyan
" />
```

### Badge Component
```tsx
<span className="
  inline-block
  px-2 py-1
  bg-neon-green/10
  border border-neon-green/50
  text-neon-green
  rounded-md
  text-xs
  font-mono
  uppercase tracking-wider
">
  Status
</span>
```

### Alert/Warning Component
```tsx
<div className="
  p-4
  bg-neon-red/5
  border-l-4 border-neon-red/50
  rounded-r-lg
  text-neon-red
  font-mono text-sm
  backdrop-blur-sm
">
  Alert message
</div>
```

### Code Block Component
```tsx
<pre className="
  bg-blueprint-950/80
  border border-neon-cyan/10
  rounded-lg
  p-4
  overflow-x-auto
  text-neon-green
  font-mono text-sm
  leading-relaxed
  backdrop-blur-sm
">
  {code}
</pre>
```

### Loading Spinner
```tsx
<div className="
  animate-spin
  w-8 h-8
  border-2 border-ghost/20
  border-t-neon-cyan
  rounded-full
"/>
```

## Layout Patterns

### Main Container (Full Height Dark)
```tsx
<div className="
  min-h-screen
  bg-gradient-to-b
  from-blueprint-950
  via-blueprint-900
  to-black
  text-bone
">
  {/* Content */}
</div>
```

### Grid Layout (Two Column)
```tsx
<div className="
  grid grid-cols-1 md:grid-cols-3 gap-4
  min-h-screen
  bg-blueprint-950
">
  <aside className="md:col-span-1 bg-blueprint-900/50 border-r border-ghost/10">
    {/* Sidebar */}
  </aside>
  <main className="md:col-span-2 p-6">
    {/* Main content */}
  </main>
</div>
```

### Node Graph Container (React Flow)
```tsx
<div className="
  w-full h-screen
  bg-blueprint-950
  border border-neon-cyan/10
  rounded-lg
  overflow-hidden
  relative
">
  <div className="absolute inset-0 bg-circuit-pattern opacity-5" />
  {/* React Flow goes here */}
</div>
```

## Text Styling

### Headings
```tsx
// H1
<h1 className="text-4xl font-bold text-bone mb-4">Main Title</h1>

// H2
<h2 className="text-2xl font-bold text-neon-cyan mb-3">Section Title</h2>

// H3
<h3 className="text-lg font-semibold text-ghost mb-2">Subsection</h3>
```

### Body Text
```tsx
// Primary text
<p className="text-base text-bone">Primary content text</p>

// Secondary text
<p className="text-sm text-ghost">Secondary information</p>

// Code/Mono text
<code className="font-mono text-sm text-neon-green bg-blueprint-900/50 px-2 py-1 rounded">
  codeExample()
</code>
```

## Interactive States

### Hover Effects
```tsx
<div className="
  group
  cursor-pointer
  hover:bg-blueprint-800/50
  hover:border-neon-cyan/40
  hover:shadow-glow-sm
  transition-all duration-200
">
  {/* Content */}
  <span className="group-hover:text-neon-cyan transition-colors">
    Hovered text
  </span>
</div>
```

### Focus States (Accessibility)
```tsx
<button className="
  focus:outline-none
  focus-visible:ring-2
  focus-visible:ring-neon-cyan
  focus-visible:ring-offset-2
  focus-visible:ring-offset-blueprint-900
  transition-all
">
  Focusable element
</button>
```

### Active States
```tsx
<a className="
  px-3 py-2
  text-ghost
  hover:text-neon-cyan
  data-[active=true]:text-neon-cyan
  data-[active=true]:border-b-2
  data-[active=true]:border-neon-cyan
  transition-colors
">
  Navigation item
</a>
```

## Animation Guidelines

### Pulse Animation (Breathing effect)
```tsx
<div className="animate-pulse-cyan">
  Breathing element
</div>
```

### Flicker Animation (Digital glitch)
```tsx
<span className="animate-flicker text-neon-cyan">
  Glitch text
</span>
```

### Scan Line Animation (CRT effect)
```tsx
<div className="
  absolute inset-0
  bg-gradient-to-b
  from-transparent via-neon-cyan/5 to-transparent
  animate-scan-line
  pointer-events-none
"/>
```

## Responsive Design

### Mobile First (Default)
```tsx
<div className="
  w-full md:w-1/2 lg:w-1/3
  p-4 md:p-6 lg:p-8
  text-sm md:text-base lg:text-lg
">
  Responsive content
</div>
```

### Grid Responsive
```tsx
<div className="
  grid
  grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
  gap-4 md:gap-6 lg:gap-8
">
  {items.map(item => (/* card */)}
</div>
```

## Dark Mode Optimization

All components are designed for dark mode by default. No need for additional dark: prefixes since the entire app uses dark theme.

Ensure sufficient contrast:
- Text on backgrounds: minimum 4.5:1 ratio for readability
- Neon colors for interactive elements (min 3:1)
- Use bone (#e8e8e8) for primary text
- Use ghost (#a0a0a0) for secondary text

## Performance Considerations

- Use `bg-gradient-to-br` instead of complex gradients
- Limit number of animated elements on screen
- Use `will-change` for heavily animated elements
- Lazy load heavy backgrounds for mobile
- Use CSS variables for theme switching (if needed in future)

---

**Note**: Semua Tailwind classes di-generated dari config. Jika menambahkan custom colors/effects, update `tailwind.config.ts` terlebih dahulu.
