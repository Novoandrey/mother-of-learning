// Global loading state for any route inside /c/[slug]/*.
// Next.js renders this during the server-side fetch of child route groups
// (catalog, encounters, electives, sessions, loops, members, settings).
// The layout (sidebar + header) stays mounted — only the <main> area shows
// this fallback.

export default function CampaignLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500"
          role="status"
          aria-label="Загрузка"
        />
        <span className="text-xs">Загрузка…</span>
      </div>
    </div>
  )
}
