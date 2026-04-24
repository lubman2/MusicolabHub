"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/nav";

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Verification token missing");
      return;
    }

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          setMessage("Email verified successfully! Redirecting...");
          setTimeout(() => router.push("/onboarding"), 2000);
        } else {
          const data = await res.json();
          setStatus("error");
          setMessage(data.error || "Verification failed");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, [searchParams, router]);

  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-2xl font-bold">Email Verification</h1>
          {status === "loading" && <p className="text-neutral-500">Verifying...</p>}
          {status === "success" && (
            <div className="rounded bg-green-50 p-4 text-green-700">{message}</div>
          )}
          {status === "error" && (
            <div className="rounded bg-red-50 p-4 text-red-700">{message}</div>
          )}
        </div>
      </main>
    </>
  );
}
