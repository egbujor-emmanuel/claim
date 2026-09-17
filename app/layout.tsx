import type { Metadata } from "next";
import { GradientBackground } from "@/components/ui/background-rowds-shop-v1";
// Tailwind utilities first so globals.css keeps the last word on shared
// selectors. Utilities are opt-in per class; no reset is imported.
import "./tailwind.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claim — not everything called a tokenized stock is a stock",
  description:
    "Three SpaceX tokens trade on Solana. One is a real share you can move to a brokerage. One is a Jersey certificate. One expires worthless in March 2027. Claim grades what you actually own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/*
          Fixed behind everything and never scrolls. Reading surfaces stay
          opaque on top of it, so only the page gutter shows the gradient and
          the text column keeps its contrast.
        */}
        <GradientBackground className="page-field" instanceId="page" />
        {children}
      </body>
    </html>
  );
}
