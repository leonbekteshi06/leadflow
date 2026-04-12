import './globals.css';

export const metadata = {
  title: 'LeadFlow CRM',
  description: 'Lead tracking and outreach CRM',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
