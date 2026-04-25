import { Nav } from "@/components/nav";
import { ForgotPasswordForm } from "./form";

export default function ForgotPasswordPage() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <ForgotPasswordForm />
      </main>
    </>
  );
}
