"use client";

import { motion } from "motion/react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

export function Hero() {
  return (
    <section className="landing-section hero">
      <div className="hero-content">
        <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
          <span className="landing-label">AI-Powered UGC Pipeline</span>
        </motion.div>

        <motion.h1
          className="hero-title"
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <em>Bulk-UGC</em>
        </motion.h1>

        <motion.p
          className="hero-desc"
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Clone any viral UGC hook, generate a new creator with your brand, and
          stitch it with your app demo — all with one pipeline.
        </motion.p>

        <motion.div
          className="hero-actions"
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <a href="/studio" className="hero-btn-primary">
            Open Studio →
          </a>
          <a href="#how-it-works" className="hero-btn-secondary">
            How it works
          </a>
        </motion.div>
      </div>

      <motion.div
        className="hero-phones"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* Reference phone */}
        <div className="phone-mockup phone-mockup-left">
          <div className="phone-notch" />
          <div className="phone-screen">
            <div className="phone-screen-content phone-screen-reference">
              <div className="phone-icon phone-icon-ref">🎬</div>
              <span className="phone-title">Reference</span>
              <span className="phone-desc">
                Competitor UGC hook you want to replicate
              </span>
            </div>
          </div>
          <span className="phone-label">Input</span>
        </div>

        {/* Connector arrow */}
        <div className="phone-connector">→</div>

        {/* Generated phone */}
        <div className="phone-mockup phone-mockup-right">
          <div className="phone-notch" />
          <div className="phone-screen">
            <div className="phone-screen-content phone-screen-generated">
              <div className="phone-icon phone-icon-gen">✨</div>
              <span className="phone-title">Your Ad</span>
              <span className="phone-desc">
                New creator, your app demo, same voice
              </span>
            </div>
          </div>
          <span className="phone-label">Output</span>
        </div>
      </motion.div>
    </section>
  );
}
