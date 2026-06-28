"use client";

import { Nav } from "@/components/nav";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type HireStatus =
  | "awaiting_start"
  | "in_progress"
  | "delivered"
  | "approved"
  | "cancelled";

type GrantableRole = "viewer" | "commenter" | "editor";

interface Party {
  id: string;
  email: string;
  profile: {
    displayName: string | null;
    headline: string | null;
    avatarUrl: string | null;
  } | null;
}

interface HireDetail {
  id: string;
  gigId: string;
  applicationId: string;
  buyerId: string;
  talentId: string;
  agreedFee: number | null;
  feeCurrency: string;
  status: HireStatus;
  startedAt: string | null;
  deliveredAt: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  deliveryNote: string | null;
  cancelReason: string | null;
  memberRole: "owner" | GrantableRole;
  createdAt: string;
  updatedAt: string;
  gig: {
    id: string;
    title: string;
    projectId: string;
    status: string;
    project: {
      id: string;
      title: string;
      ownerId: string;
    };
  };
  buyer: Party;
  talent: Party;
}

interface AuthMe {
  id: string;
}

const STATUS_LABEL: Record<HireStatus, string> = {
  awaiting_start: "Awaiting start",
  in_progress: "In progress",
  delivered: "Delivered",
  approved: "Approved",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<HireStatus, string> = {
  awaiting_start: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  delivered: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const ROLE_LABEL: Record<GrantableRole, string> = {
  viewer: "Viewer (read-only)",
  commenter: "Commenter (read + comment)",
  editor: "Editor (read + comment + upload + publish)",
};

function partyName(p: Party) {
  return p.profile?.displayName ?? p.email;
}

export default function HireDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>()!;
  const hireId = params.id;

  const [hire, setHire] = useState<HireDetail | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [pickedRole, setPickedRole] = useState<GrantableRole>("commenter");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/hires/${hireId}`), fetch(`/api/auth/me`)])
      .then(async ([hireRes, meRes]) => {
        if (cancelled) return;
        if (hireRes.status === 401) {
          router.push("/login");
          return;
        }
        if (!hireRes.ok) {
          setError("Hire not found.");
          setLoading(false);
          return;
        }
        const hireJson = (await hireRes.json()) as HireDetail;
        if (cancelled) return;
        setHire(hireJson);
        setPickedRole(
          (hireJson.memberRole === "owner"
            ? "editor"
            : hireJson.memberRole) as GrantableRole,
        );
        if (meRes.ok) {
          const meJson = (await meRes.json()) as { user?: AuthMe };
          if (!cancelled && meJson.user) setMe(meJson.user);
        }
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load hire.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hireId, router, refreshKey]);

  async function transition(next: HireStatus, extra: Record<string, unknown> = {}) {
    if (!hire) return;
    setActionPending(true);
    setActionError(null);
    const res = await fetch(`/api/hires/${hire.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, ...extra }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(json.error ?? "Failed to update hire.");
      setActionPending(false);
      return;
    }
    setDeliveryNote("");
    setCancelReason("");
    setRefreshKey((k) => k + 1);
    setActionPending(false);
  }

  async function changeAccess(role: GrantableRole) {
    if (!hire) return;
    setActionPending(true);
    setActionError(null);
    const res = await fetch(`/api/hires/${hire.id}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(json.error ?? "Failed to change access.");
      setActionPending(false);
      return;
    }
    setRefreshKey((k) => k + 1);
    setActionPending(false);
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-neutral-600">Loading…</p>
        </main>
      </>
    );
  }

  if (error || !hire) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-red-600" role="alert">
            {error ?? "Hire not found."}
          </p>
          <Link
            href="/gigs"
            className="mt-4 inline-block text-sm text-neutral-600 hover:underline"
          >
            ← Back to marketplace
          </Link>
        </main>
      </>
    );
  }

  const isBuyer = me?.id === hire.buyerId;
  const isTalent = me?.id === hire.talentId;

  const canStart =
    hire.status === "awaiting_start" && (isBuyer || isTalent);
  const canDeliver = hire.status === "in_progress" && isTalent;
  const canApprove = hire.status === "delivered" && isBuyer;
  const canCancel =
    isBuyer &&
    (hire.status === "awaiting_start" ||
      hire.status === "in_progress" ||
      hire.status === "delivered");
  const canChangeAccess =
    isBuyer && hire.status !== "cancelled";

  const currentRole: GrantableRole =
    hire.memberRole === "owner"
      ? "editor"
      : (hire.memberRole as GrantableRole);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Link
            href={`/gigs/${hire.gigId}`}
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Gig
          </Link>
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-medium ${STATUS_TONE[hire.status]}`}
          >
            {STATUS_LABEL[hire.status]}
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-bold">{hire.gig.title}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Project:{" "}
          <Link
            href={`/projects/${hire.gig.projectId}`}
            className="text-neutral-900 hover:underline"
          >
            {hire.gig.project.title}
          </Link>
        </p>

        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Buyer
            </dt>
            <dd className="text-neutral-900">{partyName(hire.buyer)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Talent
            </dt>
            <dd className="text-neutral-900">{partyName(hire.talent)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Agreed fee
            </dt>
            <dd className="text-neutral-900">
              {hire.agreedFee !== null
                ? `${hire.agreedFee} ${hire.feeCurrency}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Project access
            </dt>
            <dd className="text-neutral-900 capitalize">{hire.memberRole}</dd>
          </div>
        </dl>

        {hire.deliveryNote && (
          <section className="mt-6 rounded-md border border-purple-200 bg-purple-50 p-4">
            <h2 className="text-sm font-semibold text-purple-900">
              Delivery note
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-purple-900">
              {hire.deliveryNote}
            </p>
            {hire.deliveredAt && (
              <p className="mt-2 text-xs text-purple-700">
                Delivered {new Date(hire.deliveredAt).toLocaleString()}
              </p>
            )}
          </section>
        )}

        {hire.cancelReason && (
          <section className="mt-6 rounded-md border border-red-200 bg-red-50 p-4">
            <h2 className="text-sm font-semibold text-red-900">
              Cancellation reason
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-red-900">
              {hire.cancelReason}
            </p>
          </section>
        )}

        {/* Action panel */}
        {(canStart || canDeliver || canApprove || canCancel) && (
          <section className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-sm font-semibold text-neutral-700">
              Workflow
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {canStart && (
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => transition("in_progress")}
                  className="self-start rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Mark work as started
                </button>
              )}

              {canDeliver && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700">
                    Delivery note (optional)
                    <textarea
                      value={deliveryNote}
                      onChange={(e) => setDeliveryNote(e.target.value)}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-neutral-300 p-2 text-sm focus:border-neutral-500 focus:outline-none"
                      placeholder="Where the buyer can find the deliverables, summary, links…"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() =>
                      transition("delivered", {
                        deliveryNote: deliveryNote.trim() || undefined,
                      })
                    }
                    className="mt-2 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    Submit delivery
                  </button>
                </div>
              )}

              {canApprove && (
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => transition("approved")}
                  className="self-start rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Approve delivery &amp; close gig
                </button>
              )}

              {canCancel && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700">
                    Cancellation reason (optional)
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-neutral-300 p-2 text-sm focus:border-neutral-500 focus:outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={() =>
                      transition("cancelled", {
                        cancelReason: cancelReason.trim() || undefined,
                      })
                    }
                    className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Cancel hire
                  </button>
                </div>
              )}
            </div>
            {actionError && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {actionError}
              </p>
            )}
          </section>
        )}

        {/* Buyer-only access controls */}
        {isBuyer && canChangeAccess && (
          <section className="mt-6 rounded-md border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-700">
              Project access for {partyName(hire.talent)}
            </h2>
            <p className="mt-1 text-xs text-neutral-600">
              Hired talent starts as a Commenter by default. Promote to Editor
              if they need to upload files or publish versions.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={pickedRole}
                onChange={(e) =>
                  setPickedRole(e.target.value as GrantableRole)
                }
                className="rounded-md border border-neutral-300 p-2 text-sm"
              >
                <option value="viewer">{ROLE_LABEL.viewer}</option>
                <option value="commenter">{ROLE_LABEL.commenter}</option>
                <option value="editor">{ROLE_LABEL.editor}</option>
              </select>
              <button
                type="button"
                disabled={actionPending || pickedRole === currentRole}
                onClick={() => changeAccess(pickedRole)}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                Update access
              </button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
