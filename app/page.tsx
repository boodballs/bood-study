import { headers } from "next/headers";
import { LangProvider } from "@/components/LangProvider";
import Home from "@/components/Home";
import { getCurrentUser } from "@/lib/auth";
import { getWeeklyUsage, listDecksByUser, weeklyLimitFor } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  const serverDecks = user ? listDecksByUser(user.id) : [];

  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  const quotaKey = user ? `user:${user.id}` : `ip:${ip}`;
  const quota = {
    used: getWeeklyUsage(quotaKey),
    limit: weeklyLimitFor(user?.plan),
  };

  return (
    <LangProvider>
      <Home user={user} serverDecks={serverDecks} quota={quota} />
    </LangProvider>
  );
}
