/**
 * Application Configuration
 * Centralized configuration for environment variables and app constants
 */

export const config = {
  // Base URL for the application
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  
  // App information
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Datum',
    description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Analytics and insights platform',
  },

  // Routes
  routes: {
    home: '/',
    admin: {
      dashboard: '/admin/dashboard',
      contacts: '/admin/contacts',
      settings: '/admin/settings',
    },
    main: {
      about: '/about',
      contacts: '/contacts',
    },
  },

  // Environment
  env: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },
} as const

export default config
