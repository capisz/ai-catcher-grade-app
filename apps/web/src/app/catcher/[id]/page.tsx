import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readString(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function CatcherDetailRedirectPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;
  const season = readString(search.season);
  redirect(`/?catcher_id=${id}${season ? `&season=${season}` : ""}`);
}
