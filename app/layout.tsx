import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { ClerkProvider } from "@clerk/nextjs";
import { dark, neobrutalism } from "@clerk/themes";
import { config } from "@/lib/config";
import { Toaster } from "@/components/ui/sonner";
import UserSync from "@/components/user-sync";
 
//roboto opensans font


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: config.app.name,
  description: config.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#3b82f6",
          colorTextOnPrimaryBackground: "#ffffff",
          colorBackground: "#0a0a0a",
          colorInputBackground: "#18181b",
          colorInputText: "#fafafa",
          colorText: "#fafafa",
          colorNeutral: "#a1a1aa",
          colorDanger: "#ef4444",
          colorSuccess: "#22c55e",
          borderRadius: "0.5rem",
        },
        elements: {
          rootBox: "w-full",
          card: "shadow-2xl border border-neutral-800 bg-neutral-950",
          cardBox: "shadow-xl",
          modalBackdrop: "backdrop-blur-sm",
          modalContent: "bg-neutral-950 border border-neutral-800",
          formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm border-0 normal-case",
          formButtonPrimaryText: "text-white font-medium",
          formButtonSecondary: "border border-neutral-700 text-neutral-100 hover:bg-neutral-900",
          footerActionLink: "text-blue-500 hover:text-blue-400",
          formFieldInput: "bg-neutral-900 border border-neutral-700 text-neutral-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 placeholder:text-neutral-500",
          formFieldLabel: "text-neutral-100 font-medium",
          identityPreviewText: "text-neutral-100",
          identityPreviewEditButton: "text-blue-500 hover:text-blue-400",
          headerTitle: "text-neutral-100 font-semibold",
          headerSubtitle: "text-neutral-400",
          socialButtonsBlockButton: "border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-100",
          socialButtonsBlockButtonText: "text-neutral-100 font-medium",
          socialButtonsProviderIcon: "brightness-100",
          dividerLine: "bg-neutral-700",
          dividerText: "text-neutral-400",
          formFieldInputShowPasswordButton: "text-neutral-400 hover:text-neutral-100",
          footerActionText: "text-neutral-400",
          otpCodeFieldInput: "border border-neutral-700 text-neutral-100 bg-neutral-900 focus:border-blue-600",
          formResendCodeLink: "text-blue-500 hover:text-blue-400",
          alertText: "text-neutral-100",
          formFieldErrorText: "text-red-400",
          identityPreviewEditButtonIcon: "text-blue-500",
          formHeaderTitle: "text-neutral-100 font-semibold",
          formHeaderSubtitle: "text-neutral-400",
        },
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <UserSync />
            {children}
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
