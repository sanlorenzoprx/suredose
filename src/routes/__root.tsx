import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

const APP_NAME = "SureDose";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: APP_NAME },
      { name: "theme-color", content: "#0A4A3E" },
      {
        name: "description",
        content: "Take the right pill at the right time. Family gets a text when you do.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <p className="text-3xl font-bold leading-snug">We could not find that page.</p>
      <p className="text-xl text-muted">It may have moved, or the link was typed wrong.</p>
      <Link
        to="/"
        className="mt-2 inline-flex min-h-16 items-center justify-center rounded-lg bg-primary px-8 text-2xl font-bold text-primary-fg shadow-card"
      >
        Go to Home
      </Link>
    </div>
  ),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
