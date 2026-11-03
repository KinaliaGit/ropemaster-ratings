import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import "../globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LangSwitch } from "@/components/LangSwitch";
import { LOCALES, getDictionary, hasLocale } from "@/lib/i18n";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getDictionary(lang);
  return { title: t.meta.title, description: t.meta.description, alternates: { languages: { es: "/es", en: "/en" } } };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getDictionary(lang);
  return (
    <html lang={lang} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Header lang={lang} t={t} />
        <main className="flex-1 pt-16">{children}</main>
        <Footer t={t} lang={lang} />
        <LangSwitch lang={lang} label={t.nav.language} />
      </body>
    </html>
  );
}
