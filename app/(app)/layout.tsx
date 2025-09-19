interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      <header className="fixed top-0 left-0 z-50 hidden w-full flex-row justify-between p-6 md:flex">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://livekit.io"
          className="scale-100 transition-transform duration-300 hover:scale-110"
        ></a>
        <span className="text-foreground font-mono text-xs font-bold tracking-wider uppercase">
          LexCapital
        </span>
      </header>
      {children}
    </>
  );
}
