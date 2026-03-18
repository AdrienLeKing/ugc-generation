"use client";

import { motion } from "motion/react";

const steps = [
  {
    icon: "📥",
    title: "Upload Reference",
    desc: "Paste a TikTok/IG URL or upload an MP4 of the UGC ad you want to replicate.",
  },
  {
    icon: "📝",
    title: "Transcribe",
    desc: "AI extracts the hook script from the reference video automatically.",
  },
  {
    icon: "🎬",
    title: "Generate Hook",
    desc: "Sora creates a new 3-4s video with your character photo speaking the script.",
    active: true,
  },
  {
    icon: "🗣️",
    title: "Clone Voice",
    desc: "ElevenLabs clones the voice from the hook and generates your demo narration.",
  },
  {
    icon: "🎞️",
    title: "Stitch & Export",
    desc: "Hook + demo recording are stitched into a final 9:16 MP4 with matched audio.",
  },
];

export function Pipeline() {
  return (
    <section className="landing-section-alt">
      <div className="landing-section">
        <motion.span
          className="landing-label"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          The Pipeline
        </motion.span>
        <motion.h2
          className="landing-heading"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          Five steps. <span className="landing-heading-muted">One click.</span>
        </motion.h2>
        <motion.p
          className="landing-subheading"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          From a competitor&apos;s UGC ad to your own branded version — fully
          automated.
        </motion.p>

        <div className="pipeline-flow">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              className="pipeline-step"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <div
                className={`pipeline-icon ${step.active ? "pipeline-icon-active" : ""}`}
              >
                {step.icon}
              </div>
              <div className="pipeline-step-title">{step.title}</div>
              <div className="pipeline-step-desc">{step.desc}</div>
              {i < steps.length - 1 && (
                <span className="pipeline-arrow">→</span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
