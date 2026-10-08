import type { Metadata } from "next";
import { Archivo, Roboto, Roboto_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { ModelProvider } from "@/components/ModelProvider";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kenya Re | Nzoia Flood CAT Model",
  description:
    "Kenya Re decision-support prototype for Lower Nzoia riverine flood underwriting: JRC hazard, ML vulnerability, financial terms and explainable AI.",
  icons: {
    icon: "https://kenyare.co.ke/sites/default/files/favicon_1.png",
    shortcut: "https://kenyare.co.ke/sites/default/files/favicon_1.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${roboto.variable} ${archivo.variable} ${robotoMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <ModelProvider>
          <AppShell>{children}</AppShell>
        </ModelProvider>
      </body>
    </html>
  );
}
