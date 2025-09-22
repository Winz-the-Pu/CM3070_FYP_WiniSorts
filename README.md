**IMPORTANT!!! Hi examiners look here!!!**
**## Model Downloads**

The trained BERT model files are too large to store on GitHub (>400MB each).  
They can be downloaded here: Google Drive Link: https://drive.google.com/drive/folders/1hHywtZq4rsgNsuLJgw0EqmbwTwV85Mxj?usp=sharing 

After downloading, unzip into `api/winisorts_export/` so the structure looks like:

api/winisorts_export/

├─ primary/...

├─ method/...

├─ categories/...

├─ tokenizer/...

└─ inference_config.json

This ensures the Flask API can load the models properly.

This is the link to my Colab notebook so you can see how i trained and evaluate the models: https://colab.research.google.com/drive/1-I5PzrIzN2NONsdNE8fR8koKYAVFFf9i?usp=sharing 

---

# WiniSorts — AI-Powered Paper Classifier

A single-page web app + Flask API that classifies scientific abstracts into:

- **Primary category** (e.g., Computer Science, Biology)  
- **Research methodology** (e.g., Empirical, Theoretical)  
- **Categories / tags** (multi-label; e.g., NLP, ML)  

Results are saved to Firebase Firestore to form a real-time, collaborative mini-library.

---

## Features

- Paste an abstract → BERT-based models return predictions  
- Three tasks: primary category (single-label), methodology (single-label), categories (multi-label)  
- Live library (Firestore) with filters (discipline/methodology/category)  
- Optional title input (defaults to N/A)  
- Newest-first ordering, capped list (fast UI)  
- Works locally; easy to deploy  

---

## Architecture

- **Frontend**: Vanilla JS + Tailwind (static SPA)  
- **API**: Flask (POST `/classify`) + TensorFlow/Transformers  
- **Models**: Three fine-tuned BERT heads (TF); shared tokenizer  
- **Database**: Firebase Firestore (serverless, realtime)  

--- 

**Project Structure**

WiniSortsProject/

├─ frontend/                 # static SPA

│  ├─ index.html

│  ├─ app.js

│  └─ style.css

└─ api/                      # Flask inference API

   ├─ app.py
   
   ├─ requirements.txt
   
   └─ winisorts_export/      # exported models & tokenizer
   
      ├─ inference_config.json
      
      ├─ tokenizer/...
      
      ├─ primary/...
      
      ├─ method/...
      
      └─ categories/...
      
---

**Prerequisites**

- Python: 3.12 (tested)
- Node: not required
- Firebase project: Firestore enabled, Anonymous Auth enabled

---

## Model Export (from Colab)

In your training notebook, export models/tokenizer/labels:

# saves to /content/winisorts_export (.../primary, .../method, .../categories, tokenizer, inference_config.json)
# zip → download → unzip into WiniSortsProject/api/

Each task folder must contain:
- The TF model (tf_model.h5)  
- labels.json  
- Tokenizer files in tokenizer/  
- inference_config.json defining max_length and multi-label threshold  

---

## Backend (Flask API)

1. Open a terminal in WiniSortsProject/api and create a virtual environment:

Windows (PowerShell):
    py -m venv .venv
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\.venv\Scripts\Activate.ps1

macOS/Linux:
    python3 -m venv .venv
    source .venv/bin/activate

2. Install dependencies:
    pip install -r requirements.txt

    # Windows / TF + Keras note:
    # If you see a Keras 3 error:
    pip install "tf-keras==2.16.0"

3. Run API:
    python app.py

Health check → http://localhost:8080/health  
Response: {"status":"ok","ts":...}  

Key versions (tested):
- flask 3.0.3, flask-cors 4.0.1  
- transformers 4.41.1  
- tensorflow 2.16.1 (+ tf-keras 2.16.0 on Windows)  

---

## Frontend (Static SPA)

1. Open frontend/index.html with VS Code Live Preview (or any static server).  
2. In frontend/app.js, set the API endpoint:  
    const API_URL = "http://localhost:8080"; // update when deployed
3. Enter an optional title and the abstract, then click Classify.  

Predictions will render and a document is saved to Firestore in:  
    artifacts/<APP_ID>/public/data/papers

(You can use a constant APP_ID = "default-app-id" or any string. Changing it gives you a fresh, empty space without deleting old docs.)

---

## Firestore Rules (Secure & Immutable)

In Firebase Console → Firestore Database → Rules:

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        // Paper library (readable by anyone; writes only by signed-in users)
        match /artifacts/{appId}/public/data/papers/{docId} {
          allow read: if true; // list & get
          allow create: if request.auth != null
                        && request.resource.data.userId == request.auth.uid
                        && request.resource.data.createdAt is timestamp
                        && request.resource.data.discipline is string
                        && request.resource.data.methodology is string;
          allow update, delete: if false; // immutable once written
        }
      }
    }

Client writes must include:
- userId: auth.uid  
- createdAt: serverTimestamp() (used for orderBy('createdAt','desc'))  
- discipline (string), methodology (string), categoriesArr (array, optional), abstract, title  

---

## API Contract

Endpoint:  
    POST /classify

Request:
    { "abstract": "We present a transformer-based model..." }

Response:
    {
      "primary_category": "Computer Science",
      "research_methodology": "Empirical",
      "categories": ["Natural Language Processing","Machine Learning"],
      "confidence": {
        "primary_category": 0.92,
        "research_methodology": 0.88,
        "categories": {
          "Natural Language Processing": 0.81,
          "Machine Learning": 0.77
        }
      }
    }

Example with curl:
    curl -X POST http://localhost:8080/classify \
      -H "Content-Type: application/json" \
      -d '{"abstract":"We present a transformer-based model for scientific text classification..."}'

---

## Deployment (Optional)

API → Cloud Run (GCP)
- Create a Dockerfile, deploy with gcloud run deploy, allow unauthenticated if needed.  
- Update API_URL in app.js.  
- Tighten CORS in Flask for your domain:  
    CORS(app, resources={r"/classify": {"origins": "https://your-site"}})

API → Render / Railway
- New Web Service from repo/folder, start command:  
    python app.py
- Update API_URL.

SPA Hosting
- Firebase Hosting / GitHub Pages / Netlify (static)  

---

## Troubleshooting

- ModuleNotFoundError: flask  
  → Venv not active. Re-activate and install requirements.  

- Transformers + Keras error (Windows)  
  → pip install "tf-keras==2.16.0"  

- No module named tensorflow  
  → pip install tensorflow==2.16.1 (Windows, Python 3.12 OK)  

- Firestore permission-denied  
  → Ensure Anonymous Auth enabled, rules published, writes include userId + createdAt: serverTimestamp().  

- Ordering flicker  
  → Server timestamps resolve asynchronously; keep orderBy('createdAt','desc').  

- CORS errors  
  → Confirm flask-cors is enabled; restrict origins in production.  

---

## Evaluation Hooks (Suggested)

- Log end-to-end latency (button click → render), p50/p95.  
- Export per-task confusion matrices and macro-F1.  
- Threshold sweep for multi-label (τ ∈ {0.3, 0.5, 0.7}).  

---

## License

i have no license :( 

---

## Acknowledgements

- Hugging Face Transformers  
- TensorFlow / Keras  
- Firebase Firestore  

