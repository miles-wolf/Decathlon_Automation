# Camp Director Tools - Design Guidelines

## Design Approach: Design System-Based
**Selected System**: Tailwind UI / Linear-inspired minimalism
**Justification**: This is a utility-focused internal tool requiring clarity, efficiency, and scalability. The design emphasizes clean information hierarchy and intuitive navigation over visual flair.

## Core Design Principles
1. **Functional Clarity**: Every element serves a purpose; no decorative bloat
2. **Modular Architecture**: Tool cards as primary navigation pattern, easily extensible
3. **Professional Restraint**: Understated elegance appropriate for administrative software
4. **Responsive Efficiency**: Desktop-first with tablet optimization

---

## Design Elements

### A. Color Palette

**Light Mode:**
- Background: White / Zinc-50 (subtle gradient)
- Surface: White
- Borders: Zinc-200 (70% opacity)
- Text Primary: Zinc-900
- Text Secondary: Zinc-600
- Accent Primary: Emerald-600 (CTAs, active states)
- Accent Gradient: Emerald-400 → Cyan-500 (brand mark only)

**Dark Mode:**
- Background: Zinc-950 / Zinc-900 (subtle gradient)
- Surface: Zinc-900
- Borders: Zinc-800 (80% opacity)
- Text Primary: Zinc-100
- Text Secondary: Zinc-300
- Accent Primary: Emerald-500 (higher luminance for dark bg)
- Accent Gradient: Emerald-400 → Cyan-500 (brand mark)

### B. Typography

**Font Stack**: System font stack for speed
```
font-sans (Inter or system-ui fallback)
```

**Hierarchy:**
- Page Titles (h1): text-2xl sm:text-3xl md:text-4xl, font-bold, tracking-tight
- Section Headers (h2): text-xl sm:text-2xl, font-semibold, tracking-tight
- Card Titles (h3): text-base, font-semibold, tracking-tight
- Body Text: text-base, font-normal
- Secondary Text: text-sm, text-zinc-600/300 (light/dark)
- Labels/Captions: text-sm, font-medium

### C. Layout System

**Spacing Units**: Tailwind units of 2, 3, 4, 5, 6, 10, 12, 14, 16
- Component padding: p-4 to p-6
- Section spacing: py-10 sm:py-14
- Card gaps: gap-4
- Element spacing: gap-2 to gap-3

**Container Widths:**
- Max content width: max-w-6xl
- Form/tool containers: max-w-4xl
- Centered with: mx-auto px-4 sm:px-6

**Grid Patterns:**
- Tool cards: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4
- Form layouts: grid-cols-1 md:grid-cols-2 gap-4

### D. Component Library

**Navigation Bar:**
- Sticky positioning with backdrop blur
- Height: h-16
- Glassmorphic: bg-white/80 dark:bg-zinc-900/70
- Border: border-b border-zinc-200/70

**Tool Cards:**
- Rounded-2xl corners
- Border: border-zinc-200 dark:border-zinc-800
- Padding: p-5
- Hover: shadow-md transition
- Icon container: h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800
- CTA arrow: emerald-600, group-hover:translate-x-0.5

**Buttons:**
- Primary: bg-emerald-600 hover:bg-emerald-700, rounded-xl, h-10 px-4
- Secondary/Ghost: border border-zinc-200, rounded-xl, hover:bg-zinc-50
- Icon buttons: h-10 w-10 rounded-xl

**Input Fields:**
- Rounded-xl borders
- Border: border-zinc-200 dark:border-zinc-700
- Background: bg-white dark:bg-zinc-900
- Focus: ring-2 ring-emerald-500 ring-offset-2
- Height: h-10 for single-line, auto for textarea

**Data Tables (for job assignments):**
- Rounded-xl container with border
- Header: bg-zinc-50 dark:bg-zinc-900, font-medium, text-sm
- Rows: border-b border-zinc-200/70, hover:bg-zinc-50/50
- Cell padding: px-4 py-3
- Sticky headers on scroll

**Modal/Dialog:**
- Backdrop: bg-black/30 backdrop-blur-sm
- Panel: rounded-2xl, bg-white dark:bg-zinc-900
- Max width: max-w-2xl for forms, max-w-4xl for complex tools
- Close button: top-right, rounded-xl ghost button

**Status Indicators:**
- Success/Assigned: bg-emerald-100 dark:bg-emerald-900/30, text-emerald-700 dark:text-emerald-400
- Warning/Pending: bg-amber-100 dark:bg-amber-900/30, text-amber-700 dark:text-amber-400
- Error/Unassigned: bg-red-100 dark:bg-red-900/30, text-red-700 dark:text-red-400

### E. Job Assignment Tool Specific Patterns

**Staff Assignment Interface:**
- Split view: Staff list (left) | Assignment grid (right)
- Drag-and-drop visual feedback: opacity-50, border-2 border-dashed border-emerald-500
- Assignment cards: compact (h-12), rounded-lg, with staff name and role
- Quick actions: inline edit/delete icons on hover

**Time Slot Headers:**
- Sticky positioning during scroll
- Bold labels with time ranges
- Capacity indicators (e.g., "3/5 assigned")

**Bulk Actions Bar:**
- Sticky bottom positioning when items selected
- bg-emerald-600 with white text
- Actions: Auto-assign, Clear all, Export
- Slide-up animation on appear

### F. Iconography
- **Icon Library**: Lucide React (already in use)
- **Common Icons**: Briefcase (jobs), Clock (time), Menu (nav), Settings (config), CheckCircle (complete), AlertCircle (warning)
- **Size**: h-4 w-4 (small), h-5 w-5 (standard), h-6 w-6 (large)

---

## Images

**Hero Section**: No large hero image needed - this is a utility dashboard, not a marketing page. The existing gradient background (white to zinc-50) provides subtle visual interest without distraction.

**Tool Icons**: Icon-based visual system using Lucide icons within colored backgrounds. No photographic imagery required.

**Empty States**: Simple illustration placeholders using SVG line art in zinc-400 color, with supportive text "No assignments yet" - keep minimal and functional.

---

## Page-Specific Layouts

**Dashboard (Home):**
- Gradient hero section: 70-80vh not needed; natural height based on content (py-12 sm:py-16)
- Tool grid immediately below
- No additional marketing sections

**Job Assignment Tool Pages:**
- Persistent header: Tool name, date selector, action buttons (Save, Auto-assign)
- Main content: Full-width table or grid (max-w-6xl)
- Sidebar (optional): Filters, staff roster, quick stats
- Footer: Summary stats (total assignments, coverage %)

**Settings/Management Pages:**
- Tab navigation for sections (Jobs, Staff, Preferences)
- Form-based layouts with clear sections
- Save/Cancel actions sticky at bottom

---

## Interaction Patterns

**Navigation:**
- Tool cards are primary navigation from dashboard
- Breadcrumbs for deep navigation (Dashboard > Lunchtime Jobs)
- Back button in tool headers

**Feedback:**
- Toast notifications: top-right, slide-in, 3-second auto-dismiss
- Inline validation: show errors below fields in real-time
- Loading states: skeleton screens for data tables, spinner for actions

**Responsiveness:**
- Desktop (1024px+): Full multi-column layouts
- Tablet (768px-1023px): Collapsed sidebars, stacked sections
- Mobile (< 768px): Hide for now - desktop/tablet focus

---

## Accessibility
- Maintain dark mode consistency in all form inputs and data tables
- Focus visible: ring-2 ring-offset-2 on all interactive elements
- Sufficient color contrast: 4.5:1 minimum for text
- Keyboard navigation: tab order follows visual hierarchy
- ARIA labels on icon-only buttons