// Sentence embeddings for the semantic similarity constraint. An encoder runs
// over each text, its token states are pooled into one vector, and the vector
// is scaled to unit length so that cosine similarity is a plain dot product.
// Mean pooling is what the sentence-transformers family (MiniLM, MPNet, GTE)
// was trained with; the BGE models use the [CLS] state instead, so the catalog
// records a `pooling` per model and the worker passes it along on load.
import { mean_pooling } from '@huggingface/transformers';

/** Longest input the encoders see; phrases are far shorter, this only guards against pasted paragraphs. */
const MAX_TOKENS = 128;

/**
 * @param {{tokenizer: any, model: any, pooling?: 'mean'|'cls'}} inst
 * @param {string[]} texts
 * @returns {Promise<number[][]>} one unit-length vector per text
 */
export async function embedTexts({ tokenizer, model, pooling = 'mean' }, texts) {
  if (!texts?.length) return [];
  const enc = tokenizer(texts, { padding: true, truncation: true, max_length: MAX_TOKENS });
  const out = await model(enc);
  const hidden = out.last_hidden_state ?? out.token_embeddings ?? Object.values(out)[0]; // [n, seq, dim]
  const pooled = pooling === 'cls' ? hidden.slice(null, 0) : mean_pooling(hidden, enc.attention_mask); // [n, dim]
  const unit = pooled.normalize(2, -1);
  const [n, dim] = unit.dims;
  const data = unit.data;
  const vectors = [];
  for (let i = 0; i < n; i++) vectors.push(Array.from(data.subarray(i * dim, (i + 1) * dim), Number));
  return vectors;
}
