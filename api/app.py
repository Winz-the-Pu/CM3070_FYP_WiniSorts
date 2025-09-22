import os, json, time
from flask import Flask, request, jsonify
from flask_cors import CORS

# Make TensorFlow quieter
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

# --- ML imports (TensorFlow flavor of Transformers) ---
import tensorflow as tf
from transformers import AutoTokenizer, TFAutoModelForSequenceClassification

# ---------- Paths ----------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
EXPORT_DIR = os.path.join(BASE_DIR, "winisorts_export")
CFG_PATH = os.path.join(EXPORT_DIR, "inference_config.json")

# ---------- Load inference config ----------
with open(CFG_PATH, "r") as f:
    cfg = json.load(f)
MAX_LEN = int(cfg.get("max_length", 128))
THRESH = float(cfg.get("multilabel_threshold", 0.5))

# ---------- Tokenizer (shared) ----------
TOKENIZER_DIR = os.path.join(EXPORT_DIR, "tokenizer")
tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_DIR)

# ---------- Helper: load one model block + its labels ----------
def load_model_block(subdir: str):
    model_dir = os.path.join(EXPORT_DIR, subdir)
    labels_path = os.path.join(model_dir, "labels.json")
    with open(labels_path, "r") as f:
        labels = json.load(f)
    model = TFAutoModelForSequenceClassification.from_pretrained(model_dir)
    return model, labels

# Load three tasks
model_primary, labels_primary = load_model_block("primary")     # single-label
model_method,  labels_method  = load_model_block("method")      # single-label
model_cats,    labels_cats    = load_model_block("categories")  # multi-label

# ---------- Encoding / prediction helpers ----------
def _encode(text: str):
    return tokenizer(
        text,
        return_tensors="tf",
        truncation=True,
        padding="max_length",
        max_length=MAX_LEN,
    )

def predict_single(text: str, model, labels):
    """Single-label head → softmax → argmax"""
    inputs = _encode(text)
    outputs = model(inputs, training=False)
    logits = outputs.logits
    probs = tf.nn.softmax(logits, axis=-1).numpy()[0]
    idx = int(probs.argmax())
    return labels[idx], float(probs[idx])

def predict_multi(text: str, model, labels, threshold: float):
    """Multi-label head → sigmoid → threshold per label"""
    inputs = _encode(text)
    outputs = model(inputs, training=False)
    logits = outputs.logits
    probs = tf.math.sigmoid(logits).numpy()[0]
    selected = [(labels[i], float(p)) for i, p in enumerate(probs) if p >= threshold]
    # sort by confidence (desc)
    selected.sort(key=lambda x: x[1], reverse=True)
    return [name for name, _ in selected], selected

# ---------- Flask app ----------
app = Flask(__name__)
CORS(app)  # allow your static site to call this API locally

@app.get("/health")
def health():
    return jsonify({"status": "ok", "ts": int(time.time())})

@app.post("/classify")
def classify():
    data = request.get_json(silent=True) or {}
    abstract = (data.get("abstract") or "").strip()
    if not abstract:
        return jsonify({"error": "abstract is required"}), 400

    # Run all three predictors
    primary, pc_conf = predict_single(abstract, model_primary, labels_primary)
    method,  rm_conf = predict_single(abstract, model_method,  labels_method)
    cats, cats_scored = predict_multi(abstract, model_cats, labels_cats, THRESH)

    return jsonify({
        "primary_category": primary,
        "research_methodology": method,
        "categories": cats,
        "confidence": {
            "primary_category": pc_conf,
            "research_methodology": rm_conf,
            "categories": {name: score for name, score in cats_scored}
        }
    })

if __name__ == "__main__":
    # Local dev server
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
