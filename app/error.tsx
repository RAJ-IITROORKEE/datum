"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Home, RefreshCw } from "lucide-react"
import { config } from "@/lib/config"

export default function ErrorBoundary({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  useEffect(() => {
    // Log error to console in development
    if (config.env.isDevelopment) {
      console.error('Error caught by error boundary:', {
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        timestamp: new Date().toISOString(),
      })
    }

    // In production, you would send this to your error logging service
    // Example: logErrorToService(error)
    if (config.env.isProduction) {
      // Integrate with error logging service (e.g., Sentry, LogRocket)
      // logToErrorService({
      //   message: error.message,
      //   digest: error.digest,
      //   timestamp: new Date().toISOString(),
      //   userAgent: navigator.userAgent,
      // })
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-linear-to-b from-background to-muted/20">
      <Card className="w-full max-w-md shadow-lg border-destructive/50">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-10 h-10 text-destructive" />
          </div>
          <CardTitle className="text-3xl font-bold">Something Went Wrong</CardTitle>
          <CardDescription className="text-lg">
            An unexpected error occurred
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            We&apos;re sorry for the inconvenience. The error has been logged and we&apos;ll look into it.
          </p>
          
          {config.env.isDevelopment && (
            <div className="mt-4 p-4 bg-muted rounded-lg text-left">
              <p className="text-xs font-mono text-destructive break-all">
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button 
            variant="outline" 
            onClick={reset}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button 
            asChild
            className="w-full sm:w-auto"
          >
            <Link href={config.routes.home}>
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
