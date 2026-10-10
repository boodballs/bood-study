import { LangProvider } from "@/components/LangProvider";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;
  return (
    <LangProvider>
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-5 py-12">
          <AuthForm verifyNotice={params.verify === "invalid" ? "verifyInvalid" : undefined} />
        </main>
      </div>
    </LangProvider>
  );
}
