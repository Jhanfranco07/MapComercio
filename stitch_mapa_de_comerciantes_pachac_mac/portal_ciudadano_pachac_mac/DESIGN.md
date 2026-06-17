---
name: Portal Ciudadano Pachacámac
colors:
  surface: '#fff8f7'
  surface-dim: '#eed4d2'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ef'
  surface-container: '#ffe9e7'
  surface-container-high: '#fde2e0'
  surface-container-highest: '#f7ddda'
  on-surface: '#261817'
  on-surface-variant: '#5a413f'
  inverse-surface: '#3c2c2b'
  inverse-on-surface: '#ffedeb'
  outline: '#8d706e'
  outline-variant: '#e2bebc'
  surface-tint: '#b3272c'
  primary: '#820012'
  on-primary: '#ffffff'
  primary-container: '#a61d24'
  on-primary-container: '#ffb9b4'
  inverse-primary: '#ffb3ae'
  secondary: '#555f6f'
  on-secondary: '#ffffff'
  secondary-container: '#d6e0f3'
  on-secondary-container: '#596373'
  tertiary: '#00435d'
  on-tertiary: '#ffffff'
  tertiary-container: '#005c7d'
  on-tertiary-container: '#91d3f9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad7'
  primary-fixed-dim: '#ffb3ae'
  on-primary-fixed: '#410004'
  on-primary-fixed-variant: '#910817'
  secondary-fixed: '#d9e3f6'
  secondary-fixed-dim: '#bdc7d9'
  on-secondary-fixed: '#121c2a'
  on-secondary-fixed-variant: '#3d4756'
  tertiary-fixed: '#c3e8ff'
  tertiary-fixed-dim: '#8dcff5'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#fff8f7'
  on-background: '#261817'
  surface-variant: '#f7ddda'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  button:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  container-padding: 16px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

The design system is built to project authority, transparency, and accessibility for the Municipalidad de Pachacámac. The brand personality is **Institutional yet Approachable**, bridging the gap between formal government processes and modern digital convenience.

The style follows a **Modern Corporate** aesthetic with a strong emphasis on readability and touch-target precision. It utilizes high-contrast typography and structured layouts to ensure that citizens of all technical abilities can navigate municipal services with confidence. The visual language is clean, avoiding unnecessary decorative elements in favor of functional clarity.

## Colors

The palette is anchored by **Municipal Red (#A61D24)**, used strategically for primary actions, branding, and emphasis to maintain a sense of official identity.

- **Primary:** Municipal Red is reserved for the most important interactive elements (buttons, active navigation states).
- **Surface & Background:** Pure White is the primary canvas to ensure maximum contrast, while Light Gray (#F3F4F6) is used to differentiate content sections and background layers.
- **Semantic States:** 
  - **Green (Vigente):** Used for active permits or approved statuses.
  - **Yellow (Próximo a vencer):** Alerting users to pending deadlines.
  - **Red (Vencido):** Critical status indicators.
  - **Gray (Observado/Improcedente):** Neutral status for administrative feedback or archival data.

## Typography

The design system uses **Inter** exclusively to provide a systematic, utilitarian feel that excels in legibility across high-density information layouts. 

- **Hierarchy:** Use bold weights for headlines to establish a clear information scent. 
- **Mobile Optimization:** On smaller screens, the `headline-lg` scales down to 24px to prevent excessive line wrapping while maintaining its visual impact.
- **Readability:** Body text uses a standard 16px size for optimal accessibility. Labels and captions use a medium weight to remain legible at smaller scales.

## Layout & Spacing

This design system employs a **Fluid Grid** for mobile and a **Fixed Centered Grid** for desktop.

- **Mobile Rhythm:** Use a 4-column grid with 16px side margins and 16px gutters. All touch targets must align with a 4px baseline grid.
- **Vertical Spacing:** Elements are stacked using a consistent 8px/16px/24px scale to maintain visual rhythm.
- **Touch Targets:** A minimum height of 44px is strictly enforced for all interactive components (buttons, input fields, navigation items) to ensure ease of use for all citizens.

## Elevation & Depth

Depth is used sparingly to indicate interactivity and separate content layers without cluttering the interface.

- **Soft Shadows:** Cards and floating elements use a multi-layered, low-opacity shadow (e.g., `y: 4, blur: 12, color: rgba(0,0,0,0.05)`).
- **Surface Tiers:** 
  - **Level 0 (Background):** White (#FFFFFF) or Gray (#F3F4F6).
  - **Level 1 (Cards):** White (#FFFFFF) with a 1px border (#E5E7EB) or soft shadow.
  - **Level 2 (Modals/Overlays):** Elevated with a more pronounced shadow to focus attention.

## Shapes

The shape language is defined by a **Rounded** aesthetic to feel modern and friendly.

- **Standard Radius:** All cards and primary containers use a 16px (`rounded-xl` contextually) radius.
- **Component Radius:** Buttons and input fields use an 8px radius to maintain a professional, structured look while remaining cohesive with the card containers.

## Components

### Buttons
Primary buttons use the Municipal Red background with white text. They must have a minimum height of 48px for mobile accessibility. Secondary buttons use a light gray background or an outline style.

### Cards
Cards are the primary content container. They feature a 16px corner radius and a subtle shadow. Cards used for "Permits" or "Reports" must include a semantic color-coded indicator (Status Chip) in the top right corner.

### Status Chips
Small, high-contrast labels used to indicate the state of a document (e.g., "Vigente"). Text must be bold and centered.

### Inputs
Text fields feature an 8px corner radius, 1px border (#D1D5DB), and clear placeholder text. When focused, the border color changes to Municipal Red.

### Mobile Navigation
A persistent bottom navigation bar with 5 items:
1. **Inicio:** General dashboard.
2. **Mapa:** Local infrastructure and service locations.
3. **Registrar:** Primary "Action" tab for new applications.
4. **Buscar:** Search and tracking of existing files.
5. **Reportes:** Citizen reporting tool.

Active states in the navigation bar are indicated by the Municipal Red color and a subtle top-bar indicator.