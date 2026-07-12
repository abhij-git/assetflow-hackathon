import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AssetFlow - Enterprise Asset Management',
  description: 'Centralized ERP for asset tracking, resource booking, audits, and maintenance.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#090d16] text-[#f8fafc] min-h-screen">
        {children}
      </body>
    </html>
  )
}
