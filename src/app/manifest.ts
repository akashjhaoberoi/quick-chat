import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Quick Chat",
    short_name: "Quick Chat",
    description: "Connect. Chat. Share. — by Akarika Technologies",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0a12",
    theme_color: "#7c5cff",
    categories: ["social", "communication"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Chats", url: "/chats", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Camera", url: "/camera", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
