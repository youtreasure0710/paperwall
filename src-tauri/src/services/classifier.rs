const CATEGORY_RULES: [(&str, [&str; 4]); 9] = [
    ("Survey", ["survey", "review", "overview", "taxonomy"]),
    ("Agent", ["agent", "planning", "tool use", "autonomous"]),
    ("RAG", ["rag", "retrieval", "retrieval-augmented", "vector db"]),
    ("Multimodal", ["multimodal", "vision-language", "vlm", "cross-modal"]),
    ("LLM", ["large language model", "llm", "gpt", "instruct"]),
    ("NLP", ["nlp", "language understanding", "text", "token"]),
    ("CV", ["computer vision", "image", "detection", "segmentation"]),
    ("RL", ["reinforcement learning", "policy", "reward", "mdp"]),
    ("Systems", ["distributed", "system", "serving", "latency"]),
];

pub fn classify(title: &str, abstract_text: &str) -> String {
    let haystack = format!("{} {}", title.to_lowercase(), abstract_text.to_lowercase());
    for (category, keywords) in CATEGORY_RULES {
        if keywords.iter().any(|kw| haystack.contains(kw)) {
            return category.to_string();
        }
    }
    "Other".to_string()
}
