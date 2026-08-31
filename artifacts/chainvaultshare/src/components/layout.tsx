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
      {/* Ambient Liquid Light Orbs for Dynamic Glass Refraction */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute -top-32 -left-32 w-[550px] h-[550px] rounded-full animate-float-orb-1 opacity-75"
          style={{
            background: "radial-gradient(circle, rgba(0, 240, 255, 0.22) 0%, rgba(6, 182, 212, 0.08) 50%, transparent 75%)",
            filter: "blur(90px)",
          }}
        />
        <div 
          className="absolute top-1/4 -right-40 w-[600px] h-[600px] rounded-full animate-float-orb-2 opacity-70"
          style={{
            background: "radial-gradient(circle, rgba(147, 51, 234, 0.18) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 75%)",
            filter: "blur(100px)",
          }}
        />
        <div 
          className="absolute -bottom-40 left-1/3 w-[650px] h-[650px] rounded-full animate-float-orb-3 opacity-65"
          style={{
            background: "radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(16, 185, 129, 0.08) 50%, transparent 75%)",
            filter: "blur(110px)",
          }}
        />
      </div>

      <FloatingBackground isDark={isDark} />

      {/* Floating Liquid Glass Header */}
      <header className="sticky top-3 z-50 w-full px-4 md:px-8 max-w-6xl mx-auto">
        <div className="liquid-glass-dock rounded-2xl md:rounded-full px-5 h-16 flex items-center justify-between shadow-2xl">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3 group select-none" onClick={() => setMobileOpen(false)}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 to-blue-500/10 shadow-[0_0_15px_rgba(0,240,255,0.25)] group-hover:scale-105 transition-all">
              <svg width="20" height="20" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary">
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
            <div className="flex flex-col">
              <span className="text-xs md:text-sm font-black tracking-wider text-foreground uppercase font-mono">
                ChainVault<span className="text-primary font-normal">Share</span>
              </span>
              <span className="text-[8px] text-primary/70 tracking-widest font-mono uppercase -mt-0.5 hidden sm:inline">
                Zero-Knowledge · P2P
              </span>
            </div>
          </Link>

          {/* Desktop nav + toggle */}
          <div className="flex items-center gap-3">
            <nav className="hidden md:flex items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-2 px-4.5 py-2 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-300 ${
                      isActive ? "text-foreground font-extrabold" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <Icon className="w-3.5 h-3.5 text-primary/90 z-10" />
                    <span className="relative z-10">{item.label}</span>
                    {isActive && (
                      <motion.span
                        layoutId="activeTabBubble"
                        className="absolute inset-0 rounded-full border border-primary/40 bg-gradient-to-b from-white/12 to-primary/10 shadow-[0_4px_20px_rgba(0,240,255,0.25),inset_0_1px_2px_rgba(255,255,255,0.3)]"
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
              className="w-9 h-9 rounded-full flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all shadow-sm"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-cyan-400" />}
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden w-9 h-9 rounded-full flex items-center justify-center border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground transition-all"
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
            className="md:hidden mt-2 liquid-glass rounded-2xl p-4 space-y-2 shadow-2xl"
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
