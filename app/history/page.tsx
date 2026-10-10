import { redirect } from "next/navigation";
import { LangProvider } from "@/components/LangProvider";
import HistoryList from "@/components/HistoryList";
import { getCurrentUser } from "@/lib/auth";
import { listDecksByUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "My sets" };

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const decks = listDecksByUser(user.id);
  return (
    <LangProvider>
      <HistoryList decks={decks} email={user.email} />
    </LangProvider>
  );
}
