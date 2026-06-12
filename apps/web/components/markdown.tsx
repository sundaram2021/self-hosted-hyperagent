'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Dark-theme markdown renderer for assistant text. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body text-sm leading-relaxed text-zinc-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h1 className="mb-2 mt-4 text-xl font-semibold text-zinc-100 first:mt-0">{c}</h1>
          ),
          h2: ({ children: c }) => (
            <h2 className="mb-2 mt-4 text-lg font-semibold text-zinc-100 first:mt-0">{c}</h2>
          ),
          h3: ({ children: c }) => (
            <h3 className="mb-1.5 mt-3 text-base font-semibold text-zinc-100 first:mt-0">{c}</h3>
          ),
          p: ({ children: c }) => <p className="mb-3 last:mb-0">{c}</p>,
          ul: ({ children: c }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{c}</ul>,
          ol: ({ children: c }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{c}</ol>
          ),
          li: ({ children: c }) => <li>{c}</li>,
          a: ({ children: c, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline decoration-emerald-400/40 hover:decoration-emerald-400"
            >
              {c}
            </a>
          ),
          blockquote: ({ children: c }) => (
            <blockquote className="mb-3 border-l-2 border-zinc-700 pl-3 text-zinc-400 last:mb-0">
              {c}
            </blockquote>
          ),
          code: ({ className, children: c }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return <code className={`${className} block`}>{c}</code>;
            }
            return (
              <code className="rounded bg-zinc-800 px-1 py-0.5 text-[13px] text-emerald-300">
                {c}
              </code>
            );
          },
          pre: ({ children: c }) => (
            <pre className="mb-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[13px] leading-relaxed last:mb-0">
              {c}
            </pre>
          ),
          table: ({ children: c }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-left text-[13px]">{c}</table>
            </div>
          ),
          th: ({ children: c }) => (
            <th className="border-b border-zinc-700 px-2 py-1.5 font-medium text-zinc-300">{c}</th>
          ),
          td: ({ children: c }) => (
            <td className="border-b border-zinc-800/60 px-2 py-1.5 text-zinc-300">{c}</td>
          ),
          hr: () => <hr className="my-4 border-zinc-800" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
