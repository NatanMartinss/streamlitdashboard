export const bitcareTheme = {
  colors: {
    primary: '#007BFF', // Azul BitCare
    dark: '#002B5C',
    success: '#00B894',
    danger: '#E74C3C',
    neutralLight: '#F5F6FA',
    neutralDark: '#2D3436',
    highlight: 'rgba(0,123,255,0.1)',
  },
  spacing: {
    cardGap: '1.5rem', // gap-6
    cardRadius: '1rem', // rounded-2xl
  },
  shadows: {
    subtle: '0 1px 3px rgba(0,0,0,0.1)',
    inner: 'inset 0 1px 2px rgba(255,255,255,0.08)',
  },
};

export type BitcareTheme = typeof bitcareTheme;