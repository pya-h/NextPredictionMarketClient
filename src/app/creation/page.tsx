"use client"
import { useState } from "react";
import { motion } from "framer-motion";
import { PredictionMarketContractsService } from "@/services/prediction-market-contracts.service";

export default function Creation() {
  const [question, setQuestion] = useState("");
  const [liquidity, setLiquidity] = useState("");
  const [outcomes, setOutcomes] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddOutcome = () => {
    setOutcomes([...outcomes, ""]);
  };

  const handleRemoveOutcome = (index: number) => {
    const newOutcomes = outcomes.filter((_, i) => i !== index);
    setOutcomes(newOutcomes);
  };

  const handleOutcomeChange = (index: number, value: string) => {
    const newOutcomes = [...outcomes];
    newOutcomes[index] = value;
    setOutcomes(newOutcomes);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // TODO:
    setIsSubmitting(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-gray-800 text-white rounded-lg shadow-lg">
      <motion.h1
        className="text-2xl font-bold text-center mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        Create a New Prediction Market
      </motion.h1>

      <motion.form
        onSubmit={handleSubmit}
        className="space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-4">
          <label htmlFor="question" className="block text-sm font-semibold text-gray-300 mb-2">
            Question
          </label>
          <input
            type="text"
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="liquidity" className="block text-sm font-semibold text-gray-300 mb-2">
            Initial Liquidity
          </label>
          <input
            type="number"
            id="liquidity"
            value={liquidity}
            onChange={(e) => setLiquidity(e.target.value)}
            className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">Outcomes</label>
          {outcomes.map((outcome, index) => (
            <div key={index} className="flex items-center mb-3">
              <input
                type="text"
                value={outcome}
                onChange={(e) => handleOutcomeChange(index, e.target.value)}
                className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                placeholder={`Outcome #${index + 1}`}
                required
              />
              <button
                type="button"
                onClick={() => handleRemoveOutcome(index)}
                className="ml-2 text-red-500 hover:text-red-700 transition-colors"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddOutcome}
            className="text-blue-400 hover:text-blue-600 transition-colors"
          >
            Add Outcome
          </button>
        </div>

        <motion.div
          className="text-center"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <button
            type="submit"
            disabled={isSubmitting}
            className={`px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isSubmitting ? "bg-blue-400 cursor-not-allowed" : ""
            }`}
          >
            {isSubmitting ? "Submitting..." : "Create Market"}
          </button>
        </motion.div>
      </motion.form>
    </div>
  );
}
