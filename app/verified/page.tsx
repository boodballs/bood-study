import { LangProvider } from "@/components/LangProvider";
import Verified from "@/components/Verified";

export const metadata = { title: "Verified" };

export default function VerifiedPage() {
  return (
    <LangProvider>
      <Verified />
    </LangProvider>
  );
}
