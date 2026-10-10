import { LangProvider } from "@/components/LangProvider";
import ForgotForm from "@/components/ForgotForm";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <LangProvider>
      <div className="flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-5 py-12">
          <ForgotForm />
        </main>
      </div>
    </LangProvider>
  );
}
