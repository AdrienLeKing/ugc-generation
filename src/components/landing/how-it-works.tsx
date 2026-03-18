"use client";

import { motion } from "motion/react";

const steps = [
  {
    number: 1,
    title: "Upload your reference",
    desc: "Paste a TikTok or Instagram URL, or drop in an MP4 file. Upload a character reference photo for the hook talent.",
    detail: "Supports MP4, MOV — up to 25 MB",
  },
  {
    number: 2,
    title: "AI generates your hook",
    desc: "Sora generates a new 3-4 second video of your character speaking the transcribed script, complete with lip-synced audio.",
    detail: "Sora 2 · 9:16 vertical · lip-sync",
  },
  {
    number: 3,
    title: "Voice is cloned & applied",
    desc: "ElevenLabs instantly clones the voice from the hook video. An AI-written demo script is then narrated in that same voice.",
    detail: "ElevenLabs Instant Clone · ~3s sample",
  },
  {
    number: 4,
    title: "Final video is stitched",
    desc: "The hook and your screen recording are combined into one polished 9:16 MP4. Download the final cut, or each part separately.",
    detail: "ffmpeg · MP4 export · all parts available",
  },
];

export function HowItWorks() {
  return (
    <section className="landing-section" id="how-it-works">
      <motion.span
        className="landing-label"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        How It Works
      </motion.span>
      <motion.h2
        className="landing-heading"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        Upload. Generate.{" "}
        <span className="landing-heading-muted">Ship ads.</span>
      </motion.h2>

      <div className="timeline">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            className="timeline-step"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.12 }}
          >
            <div className="timeline-number">{step.number}</div>
            <div className="timeline-body">
              <h3 className="timeline-title">{step.title}</h3>
              <p className="timeline-desc">{step.desc}</p>
              <span className="timeline-detail">{step.detail}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
