"use client"
import { motion } from "framer-motion";

export default function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to the Prediction Market</h1>
      <p className="text-gray-600 text-lg">Choose a tab to begin.</p>
    </motion.div>

  );
}
