'use client'

export default function PaginationControls({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
  itemLabel = 'records',
}) {
  if (totalItems <= pageSize && totalPages <= 1) {
    return null
  }

  const start = Math.min((currentPage - 1) * pageSize + 1, totalItems)
  const end = Math.min(currentPage * pageSize, totalItems)

  const pages = []
  const maxButtons = 5
  let startPage = Math.max(1, currentPage - 2)
  let endPage = Math.min(totalPages, startPage + maxButtons - 1)
  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1)
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i)
  }

  return (
    <nav
      aria-label="Pagination"
      className="pagination-bar mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) px-2 pt-4 text-xs"
    >
      <span className="theme-muted">
        Showing <span className="font-semibold theme-text">{start}</span>–
        <span className="font-semibold theme-text">{end}</span> of{' '}
        <span className="font-semibold theme-text">{totalItems}</span> {itemLabel}
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="rounded-lg border border-(--line) bg-(--surface) px-2.5 py-1.5 font-medium transition hover:bg-(--surface-raised) disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          Previous
        </button>

        {startPage > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              className="rounded-lg border border-(--line) bg-(--surface) px-2.5 py-1.5 font-medium transition hover:bg-(--surface-raised)"
            >
              1
            </button>
            {startPage > 2 && <span className="theme-muted px-1">...</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={currentPage === p ? 'page' : undefined}
            className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
              currentPage === p
                ? 'bg-(--accent) text-black font-bold shadow-xs'
                : 'border border-(--line) bg-(--surface) theme-text hover:bg-(--surface-raised)'
            }`}
          >
            {p}
          </button>
        ))}

        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="theme-muted px-1">...</span>}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              className="rounded-lg border border-(--line) bg-(--surface) px-2.5 py-1.5 font-medium transition hover:bg-(--surface-raised)"
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-(--line) bg-(--surface) px-2.5 py-1.5 font-medium transition hover:bg-(--surface-raised) disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  )
}
