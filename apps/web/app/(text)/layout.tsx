/** The text pages: plain HTML in one readable column, styled here once. */
export default function TextLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[70ch] flex-1 px-4 py-6 wrap-break-word [&_a]:underline [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </main>
  )
}
