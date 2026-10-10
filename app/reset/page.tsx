import { LangProvider } from "@/components/LangProvider";
import ResetForm from "@/components/ResetForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "New password" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <LangProvider>
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-5 py-12">
          <ResetForm token={params.token ?? ""} />
        </main>
      </div>
    </LangProvider>
  );
}
