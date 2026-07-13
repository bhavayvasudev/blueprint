import { redirect } from "next/navigation";
import { Heading, Text } from "@blueprint/ui";
import { getCurrentUser } from "@/lib/api";
import { PUBLIC_API_BASE_URL } from "@/lib/config";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex max-w-xl flex-col gap-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent-600 dark:text-accent-400">
          Blueprint
        </span>
        <Heading level={1}>An evidence-grounded model of what your repository actually is.</Heading>
        <Text tone="secondary" size="lg">
          Blueprint doesn&apos;t summarize repositories — it cross-examines them. Connect a
          repository to see its real structure, not what the README claims it is.
        </Text>
      </div>
      <a
        href={`${PUBLIC_API_BASE_URL}/api/v1/auth/login`}
        className="rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
      >
        Sign in with GitHub
      </a>
    </main>
  );
}
