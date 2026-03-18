import Link from "next/link";

import { Hero } from "@/components/landing/hero";
import { Pipeline } from "@/components/landing/pipeline";
import { HowItWorks } from "@/components/landing/how-it-works";
import { BeforeAfter } from "@/components/landing/before-after";
import { CTA } from "@/components/landing/cta";

import "@/app/landing.css";

export const metadata = {
  title: "Bulk-UGC — AI-Powered UGC Ads at Scale",
  description:
    "Clone any viral UGC hook, generate a new creator with your brand, and stitch it with your app demo. Powered by Sora 2 and ElevenLabs.",
};

export default function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link href="/" className="landing-nav-brand">
          Bulk-<em>UGC</em>
        </Link>
        <div className="landing-nav-links">
          <a href="#how-it-works" className="landing-nav-link">
            How it works
          </a>
          <a href="/studio" className="landing-nav-cta">
            Open Studio
          </a>
        </div>
      </nav>

      <Hero />
      <Pipeline />
      <HowItWorks />
      <BeforeAfter />
      <CTA />

      <footer className="landing-footer">
        <span>Bulk-UGC — AI-powered UGC ads at scale</span>
        <span>2026</span>
      </footer>
    </div>
  );
}
