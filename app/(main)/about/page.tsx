"use client";

import React from 'react';
import { LayoutTextFlip } from '@/components/ui/layout-text-flip';
import { motion } from 'motion/react';
import { Card } from '@/components/ui/card';
import { Spotlight } from '@/components/ui/spotlight-new';

const About = () => {
  const words = ["Intelligence", "Innovation", "Creativity", "Precision"];

  return (
    <div className="relative min-h-screen bg-background">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <Spotlight />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-20">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-linear-to-r from-primary via-purple-500 to-primary bg-clip-text text-transparent leading-tight pb-2">
            Engineered by Architects.
          </h1>
          <div className="flex items-center justify-center gap-4 text-4xl md:text-6xl font-bold mb-8 leading-tight pb-2">
            <LayoutTextFlip
              text="Powered by "
              words={words}
              duration={3000}
            
            />
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto"
          >
            We&apos;re bridging the gap between creative intuition and construction reality.
          </motion.p>
        </motion.div>

        {/* The Story Section */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-20"
        >
          <Card className="p-8 md:p-12 backdrop-blur-sm bg-card/50 border-primary/20 hover:border-primary/40 transition-all duration-300">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-primary">
                The Story
              </h2>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="space-y-6 text-lg text-muted-foreground leading-relaxed"
            >
              <p>
                Datum wasn&apos;t born in a boardroom; it began in the architecture studios of{" "}
                <span className="text-foreground font-semibold">IIT Roorkee</span>. As students and 
                practitioners, we lived the frustration of the{" "}
                <span className="text-foreground font-semibold">&quot;drafting tax&quot;</span>—realizing 
                that for every hour we spent designing, we spent two hours on repetitive manual documentation.
              </p>
              
              <p>
                We saw highly skilled architects reduced to drafting machines, and we knew the 
                profession deserved better.
              </p>
              
              <p>
                We didn&apos;t just want faster software; we wanted a{" "}
                <span className="text-primary font-semibold">partner</span>. By fusing deep 
                architectural pedagogy with state-of-the-art{" "}
                <span className="text-foreground font-semibold">Computer Vision</span> and{" "}
                <span className="text-foreground font-semibold">Large Language Models</span>, 
                we have built the first AI Copilot that truly understands the nuance of design.
              </p>
            </motion.div>
          </Card>
        </motion.div>

        {/* Our Mission Section */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-20"
        >
          <Card className="p-8 md:p-12 backdrop-blur-sm bg-linear-to-br from-primary/10 via-purple-500/5 to-primary/10 border-primary/30 hover:border-primary/50 transition-all duration-300">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-primary">
                Our Mission
              </h2>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="space-y-6 text-lg leading-relaxed"
            >
              <p className="text-foreground">
                We believe technology should{" "}
                <span className="text-primary font-bold text-xl">amplify human creativity</span>, 
                not replace it.
              </p>
              
              <p className="text-muted-foreground">
                Datum exists to remove the bottleneck of manual drafting, allowing you to{" "}
                <span className="text-foreground font-semibold">design at the speed of thought</span>. 
                We handle the lines, the layers, and the layouts—so you can focus on the architecture.
              </p>
            </motion.div>
          </Card>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid md:grid-cols-3 gap-6"
        >
          {[
            {
              title: "AI-Powered",
              description: "Advanced Computer Vision and LLMs understand your designs",
              delay: 0.1
            },
            {
              title: "Architect-Built",
              description: "Created by architects who understand your workflow",
              delay: 0.2
            },
            {
              title: "Design-Focused",
              description: "Eliminate repetitive tasks, amplify creativity",
              delay: 0.3
            }
          ].map((feature) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: feature.delay, duration: 0.6 }}
              whileHover={{ scale: 1.05 }}
            >
              <Card className="p-6 h-full backdrop-blur-sm bg-card/50 border-blue-200/20 hover:border-blue-400/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-400/30">
                <h3 className="text-xl font-bold mb-3 text-primary">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default About;
