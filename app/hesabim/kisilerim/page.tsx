import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { listSavedPassengers } from "@/lib/saved-passengers";
import SavedPassengersManager from "@/components/account/SavedPassengersManager";

export const metadata: Metadata = { title: "Kişilerim" };
export const dynamic = "force-dynamic";

export default async function MyPassengersPage() {
  // Layout (app/hesabim/layout.tsx) oturumu zaten zorunlu kılıyor.
  const user = (await getCurrentUser())!;
  const passengers = await listSavedPassengers(user.id);

  return <SavedPassengersManager passengers={passengers} />;
}
