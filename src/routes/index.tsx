import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anouk Fashion Kassa" },
      { name: "description", content: "Kassasysteem van Anouk Fashion, Lorentsplein 14, Den Haag." },
      { property: "og:title", content: "Anouk Fashion Kassa" },
      { property: "og:description", content: "Kassasysteem van Anouk Fashion, Den Haag." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/kassa" });
  },
});
