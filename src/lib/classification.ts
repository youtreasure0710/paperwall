const categoryRules: Array<{ category: string; keywords: string[] }> = [
  { category: 'Survey', keywords: ['survey', 'review'] },
  { category: 'Agent', keywords: ['agent', 'tool use', 'planning', 'autonomous'] },
  { category: 'RAG', keywords: ['rag', 'retrieval augmented', 'retrieval'] },
  { category: 'Multimodal', keywords: ['multimodal', 'vision-language', 'vlm'] },
  { category: 'LLM', keywords: ['large language model', 'llm', 'gpt'] },
  { category: 'NLP', keywords: ['nlp', 'language understanding', 'text generation'] },
  { category: 'CV', keywords: ['computer vision', 'image', 'detection', 'segmentation'] },
  { category: 'RL', keywords: ['reinforcement learning', 'policy optimization', 'reward'] },
  { category: 'Systems', keywords: ['system', 'distributed', 'serving', 'inference engine'] },
];

export function classifyText(title: string, abstractText: string): string {
  const lower = `${title} ${abstractText}`.toLowerCase();
  for (const rule of categoryRules) {
    if (rule.keywords.some((keyword) => lower.includes(keyword))) {
      return rule.category;
    }
  }
  return 'Other';
}

export const categories = ['LLM', 'NLP', 'CV', 'Multimodal', 'Agent', 'RAG', 'RL', 'Survey', 'Systems', 'Other'];
