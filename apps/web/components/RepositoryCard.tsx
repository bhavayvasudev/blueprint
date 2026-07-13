import Link from "next/link";
import type { Repository } from "@blueprint/shared-types";
import { Badge, Surface, Text } from "@blueprint/ui";

const CONNECTION_TONE = {
  connected: "ready",
  error: "failed",
  revoked: "failed",
} as const;

export function RepositoryCard({ repository }: { repository: Repository }) {
  return (
    <Link href={`/repo/${repository.id}`} className="block">
      <Surface
        padding="md"
        className="transition hover:border-accent-400 hover:shadow-sm dark:hover:border-accent-600"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm font-medium text-ink-950 dark:text-ink-50">
              {repository.full_name}
            </span>
            <Text size="sm" tone="secondary">
              {repository.default_branch} &middot; {repository.private ? "private" : "public"}
              {repository.last_synced_at
                ? ` · last synced ${new Date(repository.last_synced_at).toLocaleString()}`
                : " · never synced"}
            </Text>
          </div>
          <Badge tone={CONNECTION_TONE[repository.connection_status]}>
            {repository.connection_status}
          </Badge>
        </div>
      </Surface>
    </Link>
  );
}
