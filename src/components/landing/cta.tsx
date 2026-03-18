"use client";

import { motion } from "motion/react";

export function CTA() {
  return (
    <section className="landing-section cta-section">
      <motion.span
        className="landing-label"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        Get Started
      </motion.span>

      <motion.h2
        className="landing-heading"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        Stop hiring creators.{" "}
        <span className="landing-heading-muted">Start generating ads.</span>
      </motion.h2>

      <motion.p
        className="landing-subheading"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        Upload a reference, add your screen recording, and get a
        production-ready UGC ad in minutes.
      </motion.p>

      <motion.div
        className="hero-actions"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <a href="/studio" className="hero-btn-primary">
          Open Studio →
        </a>
      </motion.div>

      <motion.div
        className="cta-features"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <span className="cta-feature">
          <span className="cta-feature-dot" /> Sora 2 video generation
        </span>
        <span className="cta-feature">
          <span className="cta-feature-dot" /> ElevenLabs voice cloning
        </span>
        <span className="cta-feature">
          <span className="cta-feature-dot" /> Automatic stitching
        </span>
        <span className="cta-feature">
          <span className="cta-feature-dot" /> 9:16 vertical export
        </span>
      </motion.div>
    </section>
  );
}
