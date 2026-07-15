import { AuthScreen } from "@/components/auth/auth-screen";
import { SynthApp } from "@/components/app/synth-app";
import { getCurrentSession } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const account = await getCurrentSession();
  return account ? <SynthApp account={account} /> : <AuthScreen />;
}
