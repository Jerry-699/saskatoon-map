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
    var untilKey = 'saskatoonThemeOverrideUntil';
    var saved = localStorage.getItem(key);
    var until = Number(localStorage.getItem(untilKey) || 0);
    var hour = new Date().getHours();
    var automatic = (hour >= 19 || hour < 7) ? 'dark' : 'light';
    var theme = ((saved === 'dark' || saved === 'light') && until > Date.now()) ? saved : automatic;
    if (until <= Date.now()) {
      localStorage.removeItem(key);
      localStorage.removeItem(untilKey);
    }
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
