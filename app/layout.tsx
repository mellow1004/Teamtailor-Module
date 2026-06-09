import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rekryteringsassistenten",
  description: "AI-driven kandidatanalys för Teamtailor",
};

async function logoutAction() {
  "use server";
  const c = await cookies();
  c.set("auth", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  redirect("/login");
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isAuth = !!cookieStore.get("auth")?.value;

  return (
    <html lang="sv">
      <body className="min-h-screen antialiased">
        {children}
        {isAuth && (
          <form action={logoutAction} className="fixed top-3 right-3 z-50">
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs text-gray-700 hover:text-gray-900 hover:bg-gray-50 shadow-sm transition"
            >
              Logga ut
            </button>
          </form>
        )}
      </body>
    </html>
  );
}
