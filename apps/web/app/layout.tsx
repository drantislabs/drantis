import './styles.css';
export const metadata = {
  title: 'Drantis — Evidence before AI',
  description: 'Open-source software assurance: Build → Inspect → Prove → Ship.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
