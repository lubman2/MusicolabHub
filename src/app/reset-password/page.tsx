import { Nav } from "@/components/nav";
import { ResetPasswordForm } from "./form";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;

  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <ResetPasswordForm token={token ?? ""} />
      </main>
    </>
  );
}
