import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Define protected routes (require authentication)
const isProtectedRoute = createRouteMatcher([
  '/admin(.*)',
])

// Define public routes (explicitly public, no auth required)
const isPublicRoute = createRouteMatcher([
  '/',
  '/about',
  '/contacts',
  '/sign-in(.*)',
  '/sign-up(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return
  }

  // Protect admin routes - require authentication
  if (isProtectedRoute(req)) {
    await auth.protect({
      unauthenticatedUrl: '/sign-in',
      unauthorizedUrl: '/',
    })
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
