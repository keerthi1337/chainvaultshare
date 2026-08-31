import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, ArrowRightLeft, Search, Sun, Moon, Menu, X, Download } from "lucide-react";
import { FloatingBackground } from "@/components/floating-background";
import { useTheme } from "@/components/theme-provider";
import { motion, AnimatePresence } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDark = theme === "dark";

  const navItems = [
    { href: "/", label: "Receive", icon: Download },
    { href: "/upload", label: "Upload", icon: ArrowRightLeft },
    { href: "/transfers", label: "Recent", icon: ShieldCheck },
    { href: "/verify", label: "Verify", icon: Search },
  ];

  const headerBg = isDark
    ? "rgba(10,10,15,0.22)"
    : "rgba(248,248,250,0.30)";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-mono relative overflow-x-hidden">
      <FloatingBackground isDark={isDark} />

      {/* Header */}
      <header
        className="sticky top-0 z-50 w-full border-b border-border/15"
        style={{ background: headerBg, backdropFilter: "blur(24px)" }}
      >
        <div className="w-full px-4 md:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group select-none" onClick={() => setMobileOpen(false)}>
            <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center border border-primary/30 bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <svg width="18" height="18" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
                <line x1="65" y1="90" x2="115" y2="60" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity="0.95"/>
                <line x1="65" y1="90" x2="115" y2="120" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity="0.95"/>
                <line x1="65" y1="90" x2="115" y2="60" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <line x1="65" y1="90" x2="115" y2="120" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                <circle cx="55" cy="90" r="14" fill="none" stroke="currentColor" strokeWidth="4"/>
                <circle cx="125" cy="50" r="14" fill="none" stroke="currentColor" strokeWidth="4"/>
                <circle cx="125" cy="130" r="14" fill="none" stroke="currentColor" strokeWidth="4"/>
                <circle cx="55" cy="90" r="6" fill="currentColor"/>
                <circle cx="125" cy="50" r="6" fill="currentColor"/>
                <circle cx="125" cy="130" r="6" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-xs font-bold tracking-widest text-foreground/90 group-hover:text-foreground transition-colors uppercase hidden sm:inline font-mono">
              ChainVaultShare
            </span>
          </Link>

          {/* Desktop nav + toggle */}
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-300 ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <Icon className="w-4 h-4 text-primary/85 z-10" />
                    <span className="relative z-10">{item.label}</span>
                    {isActive && (
                      <motion.span
                        layoutId="activeTabBubble"
                        className="absolute inset-0 rounded-full border border-primary/45 bg-gradient-to-b from-white/10 to-transparent shadow-[0_4px_15px_rgba(6,182,212,0.22),inset_0_1px_2px_rgba(255,255,255,0.16)]"
                        style={{ zIndex: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 25 }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Theme toggle */}
            <button
              onClick={toggle}
              data-testid="button-theme-toggle"
              className="w-8.5 h-8.5 rounded-lg flex items-center justify-center border border-border/40 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden w-8.5 h-8.5 rounded-lg flex items-center justify-center border border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground transition-all"
              onClick={() => setMobileOpen((o) => !o)}
              data-testid="button-mobile-menu"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div
            className="md:hidden border-t border-border/20 px-4 py-3 space-y-1"
            style={{ background: headerBg, backdropFilter: "blur(16px)" }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm font-semibold tracking-widest uppercase transition-all duration-300 border ${
                    isActive
                      ? "text-foreground border-primary/40 bg-gradient-to-b from-white/10 to-transparent shadow-[0_4px_12px_rgba(180,25,50,0.15),inset_0_1px_1px_rgba(255,255,255,0.12)]"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4 text-primary/85" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 relative z-10 w-full px-4 md:px-8 py-4 [perspective:1200px] flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={{ opacity: 0, scale: 0.9, rotateX: 12, y: 30 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
            exit={{ opacity: 0, scale: 1.1, rotateX: -12, y: -30 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "50% 50% -100px", backfaceVisibility: "hidden" }}
            className="w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer — centered */}
      <footer className="relative z-10 py-6 text-center border-t border-border/10 bg-card/10 backdrop-blur-sm shrink-0">
        <span className="text-xs text-muted-foreground/70 tracking-widest uppercase font-mono">
          ChainVaultShare • Recorded Securely
        </span>
      </footer>
    </div>
  );
}
