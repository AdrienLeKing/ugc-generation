"use client";

import { motion } from "motion/react";

export function BeforeAfter() {
  return (
    <section className="landing-section-alt">
      <div className="landing-section">
        <motion.span
          className="landing-label"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          Before &amp; After
        </motion.span>
        <motion.h2
          className="landing-heading"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          The old way vs.{" "}
          <span className="landing-heading-muted">Bulk-UGC.</span>
        </motion.h2>

        <div className="compare-grid">
          <motion.div
            className="compare-card"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="compare-card-label compare-card-label-before">
              Without Bulk-UGC
            </div>
            <h3 className="compare-card-title">Manual UGC production</h3>
            <ul className="compare-card-list">
              <li>
                <span className="cross">✕</span>
                Hire creators on Fiverr or UGC platforms — $150-500 per video
              </li>
              <li>
                <span className="cross">✕</span>
                Days of back-and-forth on scripts, delivery, and revisions
              </li>
              <li>
                <span className="cross">✕</span>
                One video at a time — can&apos;t test multiple hooks quickly
              </li>
              <li>
                <span className="cross">✕</span>
                Voice and style inconsistent across different creators
              </li>
              <li>
                <span className="cross">✕</span>
                No way to quickly replicate a competitor&apos;s winning format
              </li>
            </ul>
          </motion.div>

          <motion.div
            className="compare-divider"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <div className="compare-divider-line" />
            <div className="compare-divider-icon">→</div>
            <div className="compare-divider-line" />
          </motion.div>

          <motion.div
            className="compare-card compare-card-accent"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="compare-card-label compare-card-label-after">
              With Bulk-UGC
            </div>
            <h3 className="compare-card-title">AI-generated UGC in minutes</h3>
            <ul className="compare-card-list">
              <li>
                <span className="check">✓</span>
                Paste a reference URL — AI does the rest for pennies
              </li>
              <li>
                <span className="check">✓</span>
                Script transcribed, hook generated, voice cloned automatically
              </li>
              <li>
                <span className="check">✓</span>
                Test dozens of hooks with different characters instantly
              </li>
              <li>
                <span className="check">✓</span>
                Same cloned voice across hook and demo — perfectly consistent
              </li>
              <li>
                <span className="check">✓</span>
                See a winning ad? Replicate the format with your app in minutes
              </li>
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
