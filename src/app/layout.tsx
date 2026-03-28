import type { Metadata } from 'next'
import { Inter, Syne, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const syne = Syne({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-syne' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'trAIde Zone — Your AI Trading Companion',
  description: 'Disciplined intraday trading powered by AI accountability',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.className} ${syne.variable} ${jetbrainsMono.variable}`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}