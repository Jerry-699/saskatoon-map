import './globals.css'
import ThemeToggle from '@/app/components/theme-toggle'

export const metadata = {
  title: 'Saskatoon Block Finder',
  description: 'Private Saskatoon mapping app',
}

const themeScript = `
(function () {
  try {
    var key = 'saskatoonTheme';
    var saved = localStorage.getItem(key);
    var theme = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  )
}
