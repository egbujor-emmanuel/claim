import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claim — not everything called a tokenized stock is a stock",
  description:
    "Three SpaceX tokens trade on Solana. One is a real share you can move to a brokerage. One is a Jersey certificate. One expires worthless in March 2027. Claim grades what you actually own.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
