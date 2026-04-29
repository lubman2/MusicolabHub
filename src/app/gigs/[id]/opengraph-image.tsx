import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const alt = "MusicCollabHub gig";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ id: string }> };

function formatBudget(g: {
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
}) {
  if (g.budgetMin === null && g.budgetMax === null) return "Budget on request";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: g.budgetCurrency,
      maximumFractionDigits: 0,
    }).format(n);
  if (g.budgetMin !== null && g.budgetMax !== null) {
    if (g.budgetMin === g.budgetMax) return fmt(g.budgetMin);
    return `${fmt(g.budgetMin)}–${fmt(g.budgetMax)}`;
  }
  if (g.budgetMin !== null) return `From ${fmt(g.budgetMin)}`;
  return `Up to ${fmt(g.budgetMax!)}`;
}

export default async function OpenGraphImage({ params }: Props) {
  const { id } = await params;
  const gig = await prisma.gig.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      budgetMin: true,
      budgetMax: true,
      budgetCurrency: true,
      skills: true,
      project: {
        select: { title: true, deletedAt: true },
      },
      creator: {
        select: {
          email: true,
          profile: { select: { displayName: true } },
        },
      },
    },
  });

  const isVisible =
    gig && gig.project.deletedAt === null && gig.status === "published";

  const headline = isVisible ? gig.title : "MusicCollabHub";
  const subline = isVisible
    ? `${gig.project.title} · by ${
        gig.creator.profile?.displayName ?? gig.creator.email.split("@")[0]
      }`
    : "Music collaboration marketplace";
  const budgetLine = isVisible ? formatBudget(gig) : "";
  const skillsLine =
    isVisible && gig.skills.length > 0
      ? gig.skills.slice(0, 4).join(" · ")
      : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #312e81 100%)",
          color: "white",
          padding: "80px",
          fontFamily: "sans-serif",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "white",
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            M
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, opacity: 0.9 }}>
            MusicCollabHub
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: "1040px",
            }}
          >
            {headline}
          </div>
          <div style={{ fontSize: 28, opacity: 0.85 }}>{subline}</div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "32px",
            alignItems: "center",
            fontSize: 28,
            opacity: 0.9,
          }}
        >
          {budgetLine && (
            <div
              style={{
                background: "rgba(255,255,255,0.15)",
                padding: "10px 20px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              {budgetLine}
            </div>
          )}
          {skillsLine && <div>{skillsLine}</div>}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
