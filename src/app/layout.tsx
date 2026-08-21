import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ONE4FIVE — Part-145 MRO across Europe",
  description:
    "Find Part-145 approved maintenance organisations across European airports. Built for airlines and aircraft operators.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Flag pages that are framed (the map's dashboard drawer loads the
            dashboard in a same-origin <iframe>) so globals.css can hide their
            in-app header — the drawer draws its own. Runs before the header
            paints, so there's no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(window.self!==window.top)document.documentElement.classList.add('embedded')}catch(e){document.documentElement.classList.add('embedded')}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
