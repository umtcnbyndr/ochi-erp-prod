export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/20 p-4 bg-grid-pattern">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
