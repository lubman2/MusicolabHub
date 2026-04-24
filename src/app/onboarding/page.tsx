"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/nav";

type Step = 1 | 2;

interface FormData {
  displayName: string;
  headline: string;
  bio: string;
  skills: string;
  genres: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<FormData>({
    displayName: "",
    headline: "",
    bio: "",
    skills: "",
    genres: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleNextStep = () => {
    if (!formData.displayName.trim()) {
      setError("Display name is required");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      displayName: formData.displayName,
      headline: formData.headline || undefined,
      bio: formData.bio || undefined,
      skills: formData.skills
        ? formData.skills.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      genres: formData.genres
        ? formData.genres.split(",").map((g) => g.trim()).filter(Boolean)
        : [],
    };

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to complete onboarding");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setError("");

    const payload = {
      displayName: formData.displayName,
      headline: formData.headline || undefined,
      bio: formData.bio || undefined,
      skills: [],
      genres: [],
    };

    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to complete onboarding");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Welcome to MusicolabHub</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Step {step} of 2 — Complete your profile
            </p>
          </div>

          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-sm font-medium mb-1"
                >
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="How should we call you?"
                  required
                  className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="headline"
                  className="block text-sm font-medium mb-1"
                >
                  Headline
                </label>
                <input
                  id="headline"
                  name="headline"
                  type="text"
                  value={formData.headline}
                  onChange={handleChange}
                  placeholder="e.g., Music Producer & Sound Engineer"
                  className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="bio" className="block text-sm font-medium mb-1">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  placeholder="Tell us about yourself..."
                  rows={4}
                  className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="button"
                onClick={handleNextStep}
                className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="skills"
                  className="block text-sm font-medium mb-1"
                >
                  Skills <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  id="skills"
                  name="skills"
                  type="text"
                  value={formData.skills}
                  onChange={handleChange}
                  placeholder="e.g., Mixing, Mastering, Vocals (comma-separated)"
                  className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label
                  htmlFor="genres"
                  className="block text-sm font-medium mb-1"
                >
                  Genres <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  id="genres"
                  name="genres"
                  type="text"
                  value={formData.genres}
                  onChange={handleChange}
                  placeholder="e.g., Hip-Hop, R&B, Electronic (comma-separated)"
                  className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={loading}
                  className="flex-1 rounded border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50 disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Complete"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
