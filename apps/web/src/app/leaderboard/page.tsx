import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export const dynamic = "force-dynamic";

export default async function LeaderboardAliasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const resolved = readString(value);
    if (resolved.trim()) {
      search.set(key, resolved);
    }
  });

  redirect(`/research${search.size ? `?${search.toString()}` : ""}`);
}
