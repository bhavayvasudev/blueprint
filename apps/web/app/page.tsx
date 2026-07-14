import { redirect } from "next/navigation";
import { LandingStage } from "@/components/workspace/LandingStage";
import { getCurrentUser } from "@/lib/api";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return <LandingStage signInHref={`${PUBLIC_API_BASE_URL}/api/v1/auth/login`} />;
}
