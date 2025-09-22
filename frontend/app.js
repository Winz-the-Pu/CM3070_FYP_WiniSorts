import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, collection, query, addDoc, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- API endpoint ---
const API_URL = "http://localhost:8080";  // can change later if need to deploy

// --- GLOBAL VARIABLES ---
let app, db, auth;
let userId = null;
let isAuthReady = false;
let papersCache = []; // in-memory cache of papers for client-side filtering

// --- UTILITY FUNCTIONS ---
function showMessage(message) {
  const messageBox = document.getElementById('message-box');
  const messageText = document.getElementById('message-text');
  if (messageBox && messageText) {
      messageText.textContent = message;
      messageBox.classList.remove('hidden');
  }
}

function hideMessage() {
  const messageBox = document.getElementById('message-box');
  if (messageBox) {
      messageBox.classList.add('hidden');
  }
}

// --- FIREBASE AND DATA FUNCTIONS ---
async function initializeFirebase() {
    // 👇👇👇 YOUR FIREBASE CONFIGURATION 👇👇👇
    // This is the configuration you provided.
    const firebaseConfig = {
        apiKey: "AIzaSyDRbKSj6g73Vl5s_Q9TBN5DCzR_ZWwMhxY",
        authDomain: "winisorts.firebaseapp.com",
        projectId: "winisorts",
        storageBucket: "winisorts.firebasestorage.app",
        messagingSenderId: "172462442851",
        appId: "1:172462442851:web:c30eede81bf586d207eb56",
        measurementId: "G-MJ0WLXZ6GY"
    };
    // 👆👆👆 YOUR FIREBASE CONFIGURATION 👆👆👆

    if (Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        console.log("Firebase initialized successfully.");
        return true;
    } else {
        console.error("Firebase initialization failed: Configuration not provided or still contains placeholders.");
        showMessage("Failed to connect to Firebase. Please check the project configuration in the code.");
        return false;
    }
}

async function authenticateAndListen() {
    try {
        await signInAnonymously(auth);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                console.log("User authenticated with ID:", userId);
                isAuthReady = true;
                document.getElementById('auth-status').textContent = `User ID: ${userId}`;
                listenForPapers();
            } else {
                console.log("No user is signed in.");
                isAuthReady = true;
                document.getElementById('auth-status').textContent = 'User not signed in.';
            }
        });
    } catch (error) {
        console.error("Authentication error:", error);
    }
}

function renderPaper(data) {
  const papersList = document.getElementById('papers-list');
  const paperCard = document.createElement('div');
  paperCard.className = 'bg-white p-4 rounded-lg shadow-md';

  // Build chips array (prefer categoriesArr; fall back to CSV in subfield)
  const chips = Array.isArray(data.categoriesArr) && data.categoriesArr.length
    ? data.categoriesArr
    : (data.subfield ? data.subfield.split(",").map(s => s.trim()).filter(Boolean) : []);

  const chipsHtml = chips.length
    ? `<div class="mt-1 flex flex-wrap gap-2">
         ${chips.map(s => `<span class="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">${s}</span>`).join("")}
       </div>`
    : `<span class="text-sm text-gray-500 ml-1">—</span>`;

  const abstractHtml = data.abstract
    ? `<details class="mt-3 text-sm text-gray-600">
         <summary class="cursor-pointer text-gray-700 font-medium">Abstract</summary>
         <p class="mt-1">${(data.abstract || "").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
       </details>`
    : "";

  paperCard.innerHTML = `
    <h4 class="text-lg font-bold text-gray-800">${data.title || 'Classified Paper'}</h4>
    <p class="text-sm text-gray-500 mt-1">
      <strong>Discipline:</strong> ${data.discipline}<br>
      <strong>Methodology:</strong> ${data.methodology}
    </p>

    <!-- Subfield signpost + chips -->
    <div class="text-sm text-gray-500 mt-2">
      <strong>Subfield(s):</strong>
      ${chips.length ? '' : '<span class="ml-1">—</span>'}
    </div>
    ${chips.length ? chipsHtml : ''}

    ${abstractHtml}
    <p class="text-xs text-gray-400 mt-2">Added by: ${data.userId || "anonymous"}</p>
  `;

  papersList.prepend(paperCard);
}


function listenForPapers() {
    const papersList = document.getElementById('papers-list');
    const loadingMessage = document.getElementById('loading-message');
    const appId = "default-app-id"; // Using a hardcoded app ID for local testing

    if (!isAuthReady) {
        console.log("Authentication not ready. Skipping Firestore listener setup.");
        return;
    }

    const collectionPath = `artifacts/${appId}/public/data/papers`;
    const papersRef = collection(db, collectionPath);
    const q = query(papersRef, orderBy("createdAt", "desc"), limit(50));

    onSnapshot(q, (snapshot) => {
    if (snapshot.docs.length === 0) {
        loadingMessage.textContent = 'No papers yet. Be the first to add one!';
    } else {
        loadingMessage.textContent = '';
    }

    // Put docs into an in-memory cache (used by filters)
    papersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    updateFilterOptions(); 
    // Render with current filters applied
    applyFiltersAndRender();
    }, (error) => {
    console.error("Error listening to Firestore:", error);
    loadingMessage.textContent = 'Failed to load papers. Please try again later.';
    });
}

function renderPapers(list) {
  const papersList = document.getElementById('papers-list');
  papersList.innerHTML = '';
  list.forEach(renderPaper);
}

// Reads the 3 filter controls and renders the filtered list
function applyFiltersAndRender() {
  const discSel = document.getElementById('filter-discipline');
  const methSel = document.getElementById('filter-method');
  const catInput = document.getElementById('filter-category');

  const dVal = (discSel?.value || '').trim();
  const mVal = (methSel?.value || '').trim();
  const cVal = (catInput?.value || '').trim().toLowerCase();

  let filtered = papersCache.slice();

  if (dVal) {
    filtered = filtered.filter(p => (p.discipline || '').toLowerCase() === dVal.toLowerCase());
  }
  if (mVal) {
    filtered = filtered.filter(p => (p.methodology || '').toLowerCase() === mVal.toLowerCase());
  }
  if (cVal) {
    filtered = filtered.filter(p => {
      const arr = Array.isArray(p.categoriesArr)
        ? p.categoriesArr
        : (p.subfield ? p.subfield.split(",").map(s => s.trim()) : []);
      return arr.some(x => x.toLowerCase().includes(cVal));
    });
  }

  renderPapers(filtered);
}

async function savePaperToDb(paperData) {
    if (!isAuthReady || !userId) {
        console.error("Cannot save paper: Authentication not ready or user not logged in.");
        return;
    }
    try {
        const appId = "default-app-id"; // Using a hardcoded app ID for local testing
        const collectionPath = `artifacts/${appId}/public/data/papers`;
        const papersRef = collection(db, collectionPath);
        await addDoc(papersRef, {
            ...paperData,
            userId: userId,
            createdAt: serverTimestamp() 
        });
        console.log("Paper successfully added to Firestore!");
    } catch (e) {
        console.error("Error adding document: ", e);
        showMessage("Failed to save paper to the library. Please try again.");
    }
}

/**
 * Mocks the classification of a paper using dummy data.
 * This function bypasses the Gemini API to allow the app to run locally without an API key.
 * @param {string} abstract The abstract to classify (not used in this dummy function).
 * @returns {Promise<Object>} A promise that resolves to a dummy classified paper object.
 */
async function classifyPaperWithLLM(abstract, title) {
  // Call your local Flask API
  const res = await fetch(`${API_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ abstract })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${txt}`);
  }

  const data = await res.json(); // { primary_category, research_methodology, categories }

  // Map API response → your Firestore schema that renderPaper() expects
    return {
    title: (title && title.trim()) ? title.trim() : "N/A",
    discipline: data.primary_category,
    subfield: Array.isArray(data.categories) ? data.categories.join(", ") : (data.categories || "—"),
    methodology: data.research_methodology,
    categoriesArr: Array.isArray(data.categories) ? data.categories : [],  // <-- for chips
    abstract
  };
}

// Light debounce so typing in Category doesn't re-render too often
function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Hook up the three controls
function attachFilterEvents() {
  const discSel = document.getElementById('filter-discipline');
  const methSel = document.getElementById('filter-method');
  const catInput = document.getElementById('filter-category');

  if (discSel) discSel.addEventListener('change', applyFiltersAndRender);
  if (methSel) methSel.addEventListener('change', applyFiltersAndRender);
  if (catInput) catInput.addEventListener('input', debounce(applyFiltersAndRender, 200));
}

function updateFilterOptions() {
  const discSel = document.getElementById('filter-discipline');
  const methSel = document.getElementById('filter-method');
  if (!discSel || !methSel) return;

  // Preserve current selections
  const prevDisc = discSel.value || "";
  const prevMeth = methSel.value || "";

  // Collect unique values from cache
  const discSet = new Set();
  const methSet = new Set();
  for (const p of papersCache) {
    if (p.discipline) discSet.add(p.discipline);
    if (p.methodology) methSet.add(p.methodology);
  }

  // Helper to refill a <select> while keeping the "All" option
  const refill = (sel, values, prev) => {
    const keepFirst = sel.querySelector('option');
    sel.innerHTML = "";                // clear all
    sel.appendChild(keepFirst || new Option("All", "")); // ensure "All" stays
    [...values].sort().forEach(v => sel.appendChild(new Option(v, v)));
    sel.value = prev;                  // try restore previous choice
    if (sel.value !== prev) sel.value = ""; // fallback to All if prev not found
  };

  refill(discSel, discSet, prevDisc);
  refill(methSel, methSet, prevMeth);
}


// --- EVENT LISTENERS AND INITIAL SETUP ---
document.addEventListener('DOMContentLoaded', async () => {
    const isInitialized = await initializeFirebase();
    if (isInitialized) {
        authenticateAndListen();
        attachFilterEvents();

    }
    
    // Add UI element for authentication status
    const libraryPanel = document.querySelector('.bg-gray-50');
    const authStatus = document.createElement('div');
    authStatus.id = 'auth-status';
    authStatus.className = 'text-center text-xs text-gray-400 mb-2';
    libraryPanel.prepend(authStatus);

    document.getElementById('classify-btn').addEventListener('click', async () => {
        const btn = document.getElementById('classify-btn');
        const abstractInput = document.getElementById('abstract-input');
        const titleInput = document.getElementById('title-input'); 
        const abstract = abstractInput.value.trim();
        const title = (titleInput?.value || "").trim();  

        if (!abstract) {
            showMessage("Please enter a research paper abstract to classify.");
            return;
        }
        
        if (!isAuthReady) {
            console.error("App is not yet authenticated. Please wait a moment.");
            btn.textContent = 'Authenticating...';
            btn.disabled = true;
            setTimeout(() => {
                btn.textContent = 'Classify Paper';
                btn.disabled = false;
            }, 3000);
            return;
        }

        btn.textContent = 'Classifying...';
        btn.disabled = true;
        hideMessage();

        try {
            const classifiedPaper = await classifyPaperWithLLM(abstract, title);
            if (classifiedPaper) {
                savePaperToDb(classifiedPaper);
                abstractInput.value = '';
                if (titleInput) titleInput.value = ''; 
            } else {
                showMessage("Classification failed. The AI did not return a valid result.");
            }
        } catch (error) {
            console.error("Failed to classify paper:", error);
            showMessage("Classification failed. Please try again.");
        } finally {
            btn.textContent = 'Classify Paper';
            btn.disabled = false;
        }
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        document.getElementById('abstract-input').value = '';
        const titleInput = document.getElementById('title-input'); 
        if (titleInput) titleInput.value = '';  
        hideMessage();
        console.log("Reset button clicked.");
    });
});
