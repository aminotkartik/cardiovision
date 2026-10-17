import './globals.css';

export const metadata = {
  title: 'CardioVision 3D · Clinical signal explorer',
  description: 'Educational research prototype for CAD model scores and procedural coronary anatomy visualization.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
