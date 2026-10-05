import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cyber Strike VR Arena | WebXR 1:1 Cyber Shooting Game",
  description: "Meta Quest 2 WebXR 6DoF 1:1 Versus Cyber Shooting Arena & AI Rival Battle",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
