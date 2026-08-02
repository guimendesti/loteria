import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 py-12">
      <Link href="/" className="mb-8 font-display text-2xl font-bold text-brand-700">
        LotoPro
      </Link>
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}
