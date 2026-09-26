import type { SavedDashboard } from "./analytics";

export const DEFAULT_FOLDER = "Sem pasta";
export function dashboardFolder(d: SavedDashboard) {
  return d.folder?.trim() || DEFAULT_FOLDER;
}
export function selectDashboards(
  items: SavedDashboard[],
  query: string,
  folder: string,
  starred: boolean,
  sort: string,
) {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
  const search = normalize(query.trim());
  return items
    .filter(
      (d) =>
        (!starred || d.starred) &&
        (!folder || dashboardFolder(d) === folder) &&
        normalize(`${d.config.title} ${dashboardFolder(d)}`).includes(search),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.config.title.localeCompare(b.config.title, "pt-BR")
        : sort === "oldest"
          ? a.updatedAt.localeCompare(b.updatedAt)
          : b.updatedAt.localeCompare(a.updatedAt),
    );
}
export function duplicateDashboard(
  d: SavedDashboard,
  id: string,
  now: string,
): SavedDashboard {
  return {
    ...structuredClone(d),
    id,
    starred: false,
    config: {
      ...structuredClone(d.config),
      title: `${d.config.title.slice(0, 290)} · cópia`,
    },
    updatedAt: now,
  };
}
