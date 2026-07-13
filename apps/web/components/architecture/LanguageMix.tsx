import type { LanguageStat } from "@blueprint/shared-types";
import { ProportionBar } from "@blueprint/ui";

/** Repository Language Mix — proportional by lines of code, a real
 * computation over `files.loc` (Stage 1 output), never an estimated or
 * fabricated split. */
export function LanguageMix({ languages }: { languages: LanguageStat[] }) {
  const totalLoc = languages.reduce((sum, lang) => sum + lang.loc, 0);
  const sorted = [...languages].sort((a, b) => b.loc - a.loc);

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((lang) => (
        <ProportionBar
          key={lang.language}
          label={lang.language}
          count={lang.loc}
          total={totalLoc}
          countLabel={`${lang.file_count} ${lang.file_count === 1 ? "file" : "files"} · ${lang.loc.toLocaleString()} lines`}
        />
      ))}
    </div>
  );
}
