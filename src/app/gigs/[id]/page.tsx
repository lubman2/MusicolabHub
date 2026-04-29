import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { GIG_PUBLIC_SELECT } from "@/lib/gigs";
import { GigDetailActions } from "./gig-detail-actions";
import type { GigStatus } from "@/generated/prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<GigStatus, string> = {
  draft: "Draft",
  published: "Published",
  hired: "Hired",
  closed: "Closed",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

const STATUS_TONE: Record<GigStatus, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  published: "bg-green-100 text-green-800",
  hired: "bg-blue-100 text-blue-800",
  closed: "bg-neutral-200 text-neutral-700",
  cancelled: "bg-red-100 text-red-800",
  suspended: "bg-amber-100 text-amber-800",
};

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.APP_URL ||
  "http://localhost:3000";

function formatBudget(gig: {
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string;
}) {
  if (gig.budgetMin === null && gig.budgetMax === null) return "Budget on request";
  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: gig.budgetCurrency,
      maximumFractionDigits: 0,
    }).format(n);
  if (gig.budgetMin !== null && gig.budgetMax !== null) {
    if (gig.budgetMin === gig.budgetMax) return fmt(gig.budgetMin);
    return `${fmt(gig.budgetMin)}–${fmt(gig.budgetMax)}`;
  }
  if (gig.budgetMin !== null) return `From ${fmt(gig.budgetMin)}`;
  return `Up to ${fmt(gig.budgetMax!)}`;
}

const GIG_DETAIL_SELECT = {
  ...GIG_PUBLIC_SELECT,
  project: {
    select: {
      id: true,
      title: true,
      genre: true,
      ownerId: true,
      deletedAt: true,
      status: true,
    },
  },
  creator: {
    select: {
      id: true,
      email: true,
      profile: {
        select: { displayName: true, headline: true, avatarUrl: true },
      },
    },
  },
} as const;

type GigDetail = NonNullable<
  Awaited<ReturnType<typeof loadVisibleGig>>
>["gig"];

const loadVisibleGig = cache(async (gigId: string) => {
  const session = await getSession();
  const gig = await prisma.gig.findUnique({
    where: { id: gigId },
    select: GIG_DETAIL_SELECT,
  });
  if (!gig || gig.project.deletedAt !== null) return null;
  const isOwner = session?.userId === gig.project.ownerId;
  if (!isOwner && gig.status !== "published") return null;
  return { gig, isOwner, viewerId: session?.userId ?? null };
});

function truncate(input: string, max: number) {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { id } = await params;
  const result = await loadVisibleGig(id);
  if (!result) {
    return {
      title: "Gig not found · MusicCollabHub",
      robots: { index: false, follow: false },
    };
  }
  const { gig } = result;
  const title = `${gig.title} · MusicCollabHub`;
  const description = truncate(
    gig.description || `${gig.title} — gig on ${gig.project.title}.`,
    200,
  );
  const url = `${APP_URL}/gigs/${gig.id}`;
  const isPublic = gig.status === "published";

  return {
    metadataBase: new URL(APP_URL),
    title,
    description,
    alternates: { canonical: url },
    robots: isPublic
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      siteName: "MusicCollabHub",
      images: [
        {
          url: `/gigs/${gig.id}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: gig.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/gigs/${gig.id}/opengraph-image`],
    },
  };
}

function buildJsonLd(gig: GigDetail, url: string) {
  const employer =
    gig.creator.profile?.displayName ??
    gig.creator.email.split("@")[0] ??
    "MusicCollabHub creator";
  const baseSalary =
    gig.budgetMin !== null || gig.budgetMax !== null
      ? {
          "@type": "MonetaryAmount",
          currency: gig.budgetCurrency,
          value: {
            "@type": "QuantitativeValue",
            ...(gig.budgetMin !== null ? { minValue: gig.budgetMin } : {}),
            ...(gig.budgetMax !== null ? { maxValue: gig.budgetMax } : {}),
            unitText: "PROJECT",
          },
        }
      : undefined;
  const datePosted = (gig.publishedAt ?? gig.createdAt).toISOString();
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: gig.title,
    description: gig.description,
    datePosted,
    ...(gig.deadline ? { validThrough: gig.deadline.toISOString() } : {}),
    employmentType: "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: employer,
    },
    jobLocationType: "TELECOMMUTE",
    applicantLocationRequirements: {
      "@type": "Country",
      name: "Anywhere",
    },
    industry: "Music",
    occupationalCategory: gig.skills.length > 0 ? gig.skills.join(", ") : "Music",
    url,
    ...(baseSalary ? { baseSalary } : {}),
  };
}

export default async function GigDetailPage({ params }: RouteParams) {
  const { id } = await params;
  const result = await loadVisibleGig(id);
  if (!result) notFound();
  const { gig } = result;

  const url = `${APP_URL}/gigs/${gig.id}`;
  const jsonLd = buildJsonLd(gig, url);
  const creatorName =
    gig.creator.profile?.displayName ?? gig.creator.email.split("@")[0];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <div className="flex items-center justify-between">
          <Link
            href="/gigs"
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Marketplace
          </Link>
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATUS_TONE[gig.status]}`}
          >
            {STATUS_LABEL[gig.status]}
          </span>
        </div>

        <article>
          <header>
            <h1 className="mt-4 text-2xl font-bold">{gig.title}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Project:{" "}
              <Link
                href={`/projects/${gig.project.id}`}
                className="text-neutral-900 hover:underline"
              >
                {gig.project.title}
              </Link>
              {gig.project.genre ? ` · ${gig.project.genre}` : ""}
              {" · by "}
              <span>{creatorName}</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-700">
              <span className="font-medium">{formatBudget(gig)}</span>
              {gig.deadline && (
                <span className="text-neutral-600">
                  Deadline:{" "}
                  <time dateTime={gig.deadline.toISOString()}>
                    {gig.deadline.toLocaleDateString()}
                  </time>
                </span>
              )}
            </div>
            {(gig.skills.length > 0 || gig.genres.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-1">
                {gig.skills.map((s) => (
                  <span
                    key={`s-${s}`}
                    className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
                  >
                    {s}
                  </span>
                ))}
                {gig.genres.map((g) => (
                  <span
                    key={`g-${g}`}
                    className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="prose mt-6 max-w-none whitespace-pre-wrap text-sm text-neutral-800">
            {gig.description}
          </div>
        </article>

        <GigDetailActions
          gigId={gig.id}
          gigStatus={gig.status}
          ownerId={gig.project.ownerId}
          budgetCurrency={gig.budgetCurrency}
        />
      </main>
    </>
  );
}
