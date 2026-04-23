"use client";

import { Nav } from "@/components/nav";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";

type VerificationState =
  | "loading"
  | "success"
  | "expired"
  | "already_verified"
  | "already_used"
  | "invalid"
  | "error";

function VerifyContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<VerificationState>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setState("invalid");
      setErrorMessage("No verification token provided");
      return;
    }

    // Call the verification API
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();

        if (!res.ok) {
          // Handle error responses
          if (data.code === "EXPIRED") {
            setState("expired");
            setEmail(data.email);
          } else if (data.code === "ALREADY_USED") {
            setState("already_used");
            if (data.userStatus === "verified" || data.userStatus === "onboarded") {
              // If already verified via this token being used, treat as verified
              setState("already_verified");
            }
          } else {
            setState("invalid");
            setErrorMessage(data.error || "Invalid verification token");
          }
          return;
        }

        // Handle success responses
        if (data.code === "ALREADY_VERIFIED") {
          setState("already_verified");
        } else {
          setState("success");
        }
      })
      .catch((err) => {
        console.error("Verification error:", err);
        setState("error");
        setErrorMessage("An unexpected error occurred");
      });
  }, [searchParams]);

  const handleResendClick = () => {
    // TODO: Implement resend functionality in future task
    alert("Resend functionality not yet implemented");
  };

  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          {state === "loading" && (
            <>
              <div className="flex justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900"></div>
              </div>
              <h1 className="text-2xl font-bold">Verifying your email...</h1>
              <p className="text-sm text-neutral-500">Please wait</p>
            </>
          )}

          {state === "success" && (
            <>
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <svg
                    className="h-8 w-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold">Email verified!</h1>
              <p className="text-sm text-neutral-600">
                Your email has been successfully verified.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-block rounded-md bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Continue to login
                </Link>
              </div>
            </>
          )}

          {state === "already_verified" && (
            <>
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <svg
                    className="h-8 w-8 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold">Already verified</h1>
              <p className="text-sm text-neutral-600">
                Your email is already verified. You can log in to your account.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-block rounded-md bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Go to login
                </Link>
              </div>
            </>
          )}

          {state === "expired" && (
            <>
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
                  <svg
                    className="h-8 w-8 text-orange-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold">Link expired</h1>
              <p className="text-sm text-neutral-600">
                This verification link has expired.
                {email && (
                  <>
                    <br />
                    <span className="font-medium">{email}</span>
                  </>
                )}
              </p>
              <div className="pt-4 space-y-3">
                <button
                  onClick={handleResendClick}
                  className="w-full rounded-md bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Resend verification email
                </button>
                <Link
                  href="/signup"
                  className="block text-sm text-neutral-600 hover:text-neutral-900"
                >
                  Back to signup
                </Link>
              </div>
            </>
          )}

          {state === "already_used" && (
            <>
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
                  <svg
                    className="h-8 w-8 text-yellow-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold">Link already used</h1>
              <p className="text-sm text-neutral-600">
                This verification link has already been used.
              </p>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="inline-block rounded-md bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Go to login
                </Link>
              </div>
            </>
          )}

          {(state === "invalid" || state === "error") && (
            <>
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-8 w-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="text-2xl font-bold">Verification failed</h1>
              <p className="text-sm text-neutral-600">
                {errorMessage || "The verification link is invalid."}
              </p>
              <div className="pt-4 space-y-3">
                <Link
                  href="/signup"
                  className="inline-block w-full rounded-md bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Back to signup
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="flex flex-1 items-center justify-center px-4">
            <div className="w-full max-w-md space-y-6 text-center">
              <div className="flex justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900"></div>
              </div>
              <h1 className="text-2xl font-bold">Loading...</h1>
            </div>
          </main>
        </>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
