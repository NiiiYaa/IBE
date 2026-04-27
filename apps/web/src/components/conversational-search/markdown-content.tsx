'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function MarkdownContent({ content, dir }: { content: string; dir?: 'ltr' | 'rtl' }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h3: ({ children }) => <p className="mt-2 mb-1 font-semibold text-sm">{children}</p>,
        h2: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
        ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 ps-4">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 ps-4">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[var(--color-border)]">{children}</thead>,
        th: ({ children }) => (
          <th className="border border-[var(--color-border)] px-2 py-1 text-start font-semibold whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--color-border)] px-2 py-1 whitespace-nowrap">{children}</td>
        ),
        hr: () => <hr className="my-2 border-[var(--color-border)]" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
