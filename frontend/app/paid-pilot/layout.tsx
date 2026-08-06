import type { Metadata } from 'next'

export default function PilotLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col text-foreground font-sans">
      <div className="flex-1 z-(--z-main) flex flex-col">
        {children}
      </div>
    </div>
  )
}
