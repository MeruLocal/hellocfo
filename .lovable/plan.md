

# Landing Page for HelloCFO

## Overview
Create a production-grade, conversion-focused landing page at `/landing` that showcases HelloCFO's key features with modern fintech aesthetics. The landing page will be publicly accessible (no auth required) and will redirect authenticated users or provide a "Go to Dashboard" option.

## Page Structure

### Section 1 - Hero
- Large headline: "Your AI-Powered CFO, Always On Duty"
- Subheadline explaining the value proposition
- CTA buttons: "Get Started" (links to /auth) and "See Features"
- Animated gradient background with subtle grid pattern
- Mock dashboard screenshot/illustration using CSS art (cards, charts)

### Section 2 - Key Features Grid (6 features)
Each feature card with icon, title, and description:
1. **AI Intent Engine** - AI auto-generates query intents with training phrases, entities, pipelines
2. **Real-time CFO Agent** - Conversational AI that resolves financial queries in real-time with SSE streaming
3. **Multi-Module Coverage** - 14+ modules: Sales, GST, Inventory, Purchases, Reports, Fixed Assets, etc.
4. **Smart Data Pipeline** - Visual pipeline builder with MCP tool integration for data fetching and computation
5. **Test Cases Library** - 150+ pre-built test cases with export to Markdown and CSV
6. **API Console** - Built-in API testing console with live request/response inspection

### Section 3 - How It Works (3-step flow)
1. Configure intents and modules
2. AI generates training phrases, entities, and pipelines
3. Real-time agent resolves user queries

### Section 4 - Modules Showcase
Animated scrolling row of module badges (Sales, Purchases, GST, Inventory, Reports, Accounting Masters, etc.) showing the breadth of coverage.

### Section 5 - Stats/Numbers
Key metrics displayed in a horizontal row:
- "14+ Modules"
- "150+ Test Cases"
- "Real-time Streaming"
- "AI-Powered"

### Section 6 - CTA Footer
Final call-to-action with "Start Using HelloCFO" button and brief reassurance text.

### Navigation Bar
- HelloCFO logo/text on the left
- Feature links (smooth scroll anchors)
- "Sign In" button on the right

## Technical Details

### Files to Create
1. **`src/pages/Landing.tsx`** - The full landing page component with all sections. Self-contained with inline section components. Uses existing UI primitives (Button, Card) and lucide icons. Includes smooth-scroll navigation and responsive design (mobile-first).

### Files to Modify
1. **`src/App.tsx`** - Add `/landing` route
2. **`src/pages/Index.tsx`** - Change unauthenticated redirect from `/auth` to `/landing`

### Design Approach
- Uses the existing design system (CSS variables for colors, Inter font, Tailwind classes)
- Gradient accents using `--primary`, `--ai` color variables
- Smooth scroll-linked animations using CSS only (no extra libraries)
- Fully responsive: mobile, tablet, desktop
- Dark-friendly since it uses CSS variable-based theming

### No New Dependencies
Everything built with existing Tailwind CSS, lucide-react icons, and shadcn/ui components.

