# Necro-Docs: Tailwind Theme & Styling Guide

## Theme Configuration

### Clean Modern Minimal Design

Tema Necro-Docs menggunakan aesthetic clean modern dengan white backgrounds, minimal shadows, dan accent colors yang subtle.

## Color System

### Primary Colors (Canvas & Surface)
```
Canvas:   #FFFFFF - Main background
Surface:  #F6F7F9 - Secondary/elevated backgrounds
Ink:      #111113 - Primary text color
Muted:    #686A72 - Secondary text, placeholders
Hairline: #E8E9ED - Borders, dividers
```

### Accent Colors
```
Sky:      #0284C7 - Primary accent, links, focus states
Crimson:  #E11D48 - Errors, warnings, high-risk alerts
Amber:    #D97706 - Warnings, caution
Emerald:  #059669 - Success states
```

### Stage Colors (For UI elements)
```
Stage Sky:    #E0F2FE - Light blue background for sections
Stage Pink:   #FCE7F3 - Light pink for decorative elements
Stage Violet: #EDE9FE - Light purple for sections
Closing Sky:  #F0F9FF - Light blue for CTA sections
Grid Dot:     #D4D4D8 - Grid pattern background
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
        // Primary palette
        canvas: '#FFFFFF',
        surface: '#F6F7F9',
        ink: '#111113',
        muted: '#686A72',
        hairline: '#E8E9ED',
        
        // Accent colors
        skyAccent: '#0284C7',
        crimson: '#E11D48',
        amber: '#D97706',
        emerald: '#059669',
        
        // Stage colors
        stageSky: '#E0F2FE',
        stagePink: '#FCE7F3',
        stageViolet: '#EDE9FE',
        closingSky: '#F0F9FF',
        gridDot: '#D4D4D8',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-display)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 24px 60px -15px rgba(17, 17, 19, 0.08), 0 4px 16px -2px rgba(17, 17, 19, 0.03)',
        'sm': '0 1px 2px 0 rgba(17, 17, 19, 0.05)',
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
        '5xl': ['3rem', { lineHeight: '1.2' }],
        '6xl': ['3.75rem', { lineHeight: '1.1' }],
      },
    },
  },
  plugins: [],
};

export default config;
```

## Component Styling Patterns

### Card Component (Clean White with Border)
```tsx
<div className="
  rounded-3xl
  border border-hairline
  bg-white
  p-6 sm:p-8
  shadow-card
  hover:shadow-lg
  transition-shadow
">
  {/* Content */}
</div>
```

### Button Component (Primary - Sky Accent)
```tsx
<button className="
  px-6 py-2.5
  rounded-full
  bg-ink
  text-white
  text-xs
  font-semibold
  hover:opacity-90
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-skyAccent
  focus-visible:ring-offset-2
  transition-all
  uppercase tracking-wide
">
  Button Text
</button>
```

### Button Component (Secondary)
```tsx
<button className="
  px-4 py-2
  rounded-full
  bg-surface
  border border-hairline
  text-ink
  text-xs
  font-medium
  hover:bg-hairline
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-skyAccent
  transition-colors
">
  Secondary
</button>
```

### Input/Search Component
```tsx
<input className="
  w-full
  bg-white
  border border-hairline
  text-ink
  rounded-full
  px-4 py-2.5
  text-sm
  font-mono
  placeholder:text-muted
  focus:outline-none
  focus:ring-2
  focus:ring-skyAccent
  focus:border-transparent
  transition-all
  caret-skyAccent
" />
```

### Badge Component
```tsx
<span className="
  inline-block
  px-2.5 py-1
  bg-stageSky
  border border-hairline
  text-skyAccent
  rounded-md
  text-xs
  font-mono
  font-semibold
">
  Status
</span>
```

### Alert Component (Error/Crimson)
```tsx
<div className="
  p-4
  bg-white
  border-l-4 border-crimson
  rounded-r-lg
  text-crimson
  text-sm
">
  Alert message
</div>
```

### Code Block Component
```tsx
<pre className="
  bg-white
  border border-hairline
  rounded-2xl
  p-4
  overflow-x-auto
  text-ink
  font-mono text-sm
  leading-relaxed
  shadow-sm
">
  {code}
</pre>
```

### Loading Spinner
```tsx
<div className="
  animate-spin
  w-8 h-8
  border-2 border-hairline
  border-t-skyAccent
  rounded-full
"/>
```

## Layout Patterns

### Main Container (Full Height White)
```tsx
<div className="
  min-h-screen
  bg-canvas
  text-ink
">
  {/* Content */}
</div>
```

### Grid Layout (Two Column)
```tsx
<div className="
  grid grid-cols-1 md:grid-cols-3 gap-6
  min-h-screen
  bg-canvas
">
  <aside className="md:col-span-1 bg-surface border-r border-hairline">
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
  bg-white
  border border-hairline
  rounded-2xl
  overflow-hidden
  relative
">
  {/* React Flow goes here */}
</div>
```

## Text Styling

### Headings
```tsx
// H1 - Display heading
<h1 className="font-display text-5xl sm:text-6xl font-bold leading-tight text-ink">
  Main Title
</h1>

// H2 - Section heading
<h2 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-3">
  Section Title
</h2>

// H3 - Subsection
<h3 className="font-display text-lg font-bold text-ink mb-2">
  Subsection
</h3>
```

### Body Text
```tsx
// Primary text
<p className="text-base text-ink leading-relaxed">Primary content text</p>

// Secondary text
<p className="text-sm text-muted">Secondary information</p>

// Code/Mono text
<code className="font-mono text-xs bg-surface px-2 py-1 rounded text-ink">
  codeExample()
</code>
```

## Interactive States

### Hover Effects
```tsx
<div className="
  group
  cursor-pointer
  hover:bg-surface
  hover:border-hairline
  transition-colors
">
  {/* Content */}
  <span className="group-hover:text-skyAccent transition-colors">
    Hovered text
  </span>
</div>
```

### Focus States (Accessibility)
```tsx
<button className="
  focus:outline-none
  focus-visible:ring-2
  focus-visible:ring-skyAccent
  focus-visible:ring-offset-2
  transition-all
">
  Focusable element
</button>
```

### Active States
```tsx
<a className="
  px-3 py-2
  text-muted
  hover:text-ink
  data-[active=true]:text-skyAccent
  data-[active=true]:border-b-2
  data-[active=true]:border-skyAccent
  transition-colors
">
  Navigation item
</a>
```

## Animation Guidelines

Animations di Necro-Docs menggunakan easing cubic-bezier(0.22, 1, 0.36, 1) untuk smooth, natural motion.

### Smooth Fade & Scale
```tsx
<div className="
  opacity-0 scale-95
  transition duration-300
  group-hover:opacity-100 group-hover:scale-100
">
  Animated content
</div>
```

### Scrolly Animation (Stagger Effect)
```tsx
<div className="
  opacity-0 translate-y-4
  transition duration-500 ease-out
  group-hover:opacity-100 group-hover:translate-y-0
">
  Staggered content
</div>
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
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

## Light Mode Optimization

Semua components dirancang untuk light mode dengan white/light gray backgrounds dan dark text.

Contrast guidelines:
- Text on backgrounds: minimum 4.5:1 ratio untuk readability
- Primary text: `text-ink` (#111113)
- Secondary text: `text-muted` (#686A72)
- Links & interactive: `text-skyAccent` (#0284C7)

## Performance Considerations

- Gunakan native CSS transitions untuk smooth, GPU-accelerated motion
- Batasi jumlah animated elements on screen
- Gunakan `will-change` untuk frequently animated elements
- Lazy load heavy backgrounds untuk mobile
- Prefer box-shadows yang subtle over complex gradients

---

**Note**: Semua Tailwind classes di-generated dari config. Jika menambahkan custom colors/effects, update `tailwind.config.ts` terlebih dahulu.
