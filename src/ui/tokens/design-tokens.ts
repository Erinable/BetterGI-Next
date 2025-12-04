/**
 * BetterGI-Next Design Tokens
 * Central design system for consistent UI/UX
 */

export const DesignTokens = {
  // Colors
  colors: {
    // Brand colors
    primary: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      900: '#0c4a6e',
      main: '#107c10', // Microsoft green
      light: '#138913',
      dark: '#0d5f0d',
    },

    // Semantic colors
    success: '#107c10',
    warning: '#ff8c00',
    danger: '#d13438',
    info: '#0078d4',

    // Background colors
    background: {
      primary: 'rgba(18, 18, 18, 0.95)',
      secondary: 'rgba(32, 32, 32, 0.95)',
      tertiary: 'rgba(45, 45, 45, 0.95)',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },

    // Surface colors
    surface: {
      primary: 'rgba(24, 24, 24, 0.95)',
      secondary: 'rgba(38, 38, 38, 0.95)',
      elevated: 'rgba(52, 52, 52, 0.95)',
    },

    // Text colors
    text: {
      primary: '#ffffff',
      secondary: '#cccccc',
      tertiary: '#aaaaaa',
      disabled: '#666666',
      inverse: '#000000',
    },

    // Border colors
    border: {
      primary: 'rgba(255, 255, 255, 0.2)',
      secondary: 'rgba(255, 255, 255, 0.1)',
      focus: '#0078d4',
      hover: 'rgba(255, 255, 255, 0.3)',
    },

    // Interactive states
    state: {
      hover: 'rgba(255, 255, 255, 0.1)',
      active: 'rgba(255, 255, 255, 0.15)',
      focus: 'rgba(0, 120, 212, 0.3)',
      disabled: 'rgba(255, 255, 255, 0.05)',
    },
  },

  // Spacing
  spacing: {
    xs: '2px',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '20px',
    '3xl': '24px',
    '4xl': '32px',
  },

  // Border radius
  borderRadius: {
    none: '0',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '50%',
  },

  // Typography
  typography: {
    fontFamily: {
      primary: "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      mono: "'Cascadia Code', 'Consolas', 'Monaco', monospace",
    },
    fontSize: {
      xs: '10px',
      sm: '11px',
      base: '12px',
      md: '14px',
      lg: '16px',
      xl: '18px',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.4',
      relaxed: '1.6',
    },
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 10px rgba(0, 0, 0, 0.5)',
    lg: '0 8px 25px rgba(0, 0, 0, 0.7)',
    xl: '0 16px 40px rgba(0, 0, 0, 0.8)',
    glow: '0 0 20px rgba(16, 124, 16, 0.3)',
  },

  // Z-index scale
  zIndex: {
    base: 1,
    overlay: 1000,
    modal: 2000,
    toast: 3000,
    tooltip: 4000,
    maximum: 9999,
  },

  // Transitions
  transitions: {
    fast: '150ms ease-out',
    normal: '250ms ease-out',
    slow: '350ms ease-out',
    bouncy: '0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Component specific
  components: {
    panel: {
      width: {
        sm: '200px',
        md: '240px',
        lg: '280px',
      },
      padding: '12px',
      borderRadius: '8px',
    },

    button: {
      height: {
        sm: '28px',
        md: '32px',
        lg: '36px',
      },
      padding: '8px 16px',
      borderRadius: '4px',
    },

    floatBall: {
      size: {
        normal: '40px',
        docked: '6px',
        dockedExpanded: '30px',
      },
    },

    input: {
      height: '28px',
      padding: '4px 8px',
      borderRadius: '4px',
    },
  },
};

// CSS Custom Properties for runtime theme switching
export const generateCSSVariables = () => `
  :root {
    /* Colors */
    --color-primary-main: ${DesignTokens.colors.primary.main};
    --color-primary-light: ${DesignTokens.colors.primary.light};
    --color-primary-dark: ${DesignTokens.colors.primary.dark};

    --color-success: ${DesignTokens.colors.success};
    --color-warning: ${DesignTokens.colors.warning};
    --color-danger: ${DesignTokens.colors.danger};
    --color-info: ${DesignTokens.colors.info};

    --color-bg-primary: ${DesignTokens.colors.background.primary};
    --color-bg-secondary: ${DesignTokens.colors.background.secondary};
    --color-bg-tertiary: ${DesignTokens.colors.background.tertiary};
    --color-bg-overlay: ${DesignTokens.colors.background.overlay};

    --color-surface-primary: ${DesignTokens.colors.surface.primary};
    --color-surface-secondary: ${DesignTokens.colors.surface.secondary};
    --color-surface-elevated: ${DesignTokens.colors.surface.elevated};

    --color-text-primary: ${DesignTokens.colors.text.primary};
    --color-text-secondary: ${DesignTokens.colors.text.secondary};
    --color-text-tertiary: ${DesignTokens.colors.text.tertiary};
    --color-text-disabled: ${DesignTokens.colors.text.disabled};

    --color-border-primary: ${DesignTokens.colors.border.primary};
    --color-border-secondary: ${DesignTokens.colors.border.secondary};
    --color-border-focus: ${DesignTokens.colors.border.focus};

    --color-state-hover: ${DesignTokens.colors.state.hover};
    --color-state-active: ${DesignTokens.colors.state.active};
    --color-state-focus: ${DesignTokens.colors.state.focus};

    /* Spacing */
    --spacing-xs: ${DesignTokens.spacing.xs};
    --spacing-sm: ${DesignTokens.spacing.sm};
    --spacing-md: ${DesignTokens.spacing.md};
    --spacing-lg: ${DesignTokens.spacing.lg};
    --spacing-xl: ${DesignTokens.spacing.xl};
    --spacing-2xl: ${DesignTokens.spacing['2xl']};
    --spacing-3xl: ${DesignTokens.spacing['3xl']};

    /* Border Radius */
    --radius-sm: ${DesignTokens.borderRadius.sm};
    --radius-md: ${DesignTokens.borderRadius.md};
    --radius-lg: ${DesignTokens.borderRadius.lg};
    --radius-xl: ${DesignTokens.borderRadius.xl};
    --radius-full: ${DesignTokens.borderRadius.full};

    /* Typography */
    --font-primary: ${DesignTokens.typography.fontFamily.primary};
    --font-mono: ${DesignTokens.typography.fontFamily.mono};

    --font-size-xs: ${DesignTokens.typography.fontSize.xs};
    --font-size-sm: ${DesignTokens.typography.fontSize.sm};
    --font-size-base: ${DesignTokens.typography.fontSize.base};
    --font-size-md: ${DesignTokens.typography.fontSize.md};
    --font-size-lg: ${DesignTokens.typography.fontSize.lg};

    --font-weight-normal: ${DesignTokens.typography.fontWeight.normal};
    --font-weight-medium: ${DesignTokens.typography.fontWeight.medium};
    --font-weight-semibold: ${DesignTokens.typography.fontWeight.semibold};
    --font-weight-bold: ${DesignTokens.typography.fontWeight.bold};

    /* Shadows */
    --shadow-sm: ${DesignTokens.shadows.sm};
    --shadow-md: ${DesignTokens.shadows.md};
    --shadow-lg: ${DesignTokens.shadows.lg};
    --shadow-glow: ${DesignTokens.shadows.glow};

    /* Transitions */
    --transition-fast: ${DesignTokens.transitions.fast};
    --transition-normal: ${DesignTokens.transitions.normal};
    --transition-slow: ${DesignTokens.transitions.slow};
    --transition-bouncy: ${DesignTokens.transitions.bouncy};

    /* Component Specific */
    --panel-width-md: ${DesignTokens.components.panel.width.md};
    --panel-padding: ${DesignTokens.components.panel.padding};
    --panel-radius: ${DesignTokens.components.panel.borderRadius};

    --button-height-md: ${DesignTokens.components.button.height.md};
    --button-padding: ${DesignTokens.components.button.padding};
    --button-radius: ${DesignTokens.components.button.borderRadius};

    --float-ball-size: ${DesignTokens.components.floatBall.size.normal};
    --float-ball-size-docked: ${DesignTokens.components.floatBall.size.docked};
    --float-ball-size-docked-expanded: ${DesignTokens.components.floatBall.size.dockedExpanded};
  }
`;