const API_KEY = 'AIzaSyB3umTE3n2d5gwKzOmJz4ss1pFZMR8_vOE';
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
let currentUser = null;
let pinnedFiles = [];
let currentConversation = [];
let conversations = {};
let currentApiKeyIndex = 0;

const FREE_CREDITS_PER_DAY = 3;
const FREE_CREDITS_REGISTER = 10;
const FREE_MODEL_MAX_WORDS = 50000;
const FREE_MODEL_MAX_RESPONSE = 2000;

// Configuration du système de retry
const RETRY_CONFIG = {
    maxAttempts: 3,  // Nombre maximum de tentatives avec différentes clés
    retryDelay: 1000 // Délai entre les tentatives en millisecondes
};

// Message système à définir
const SYSTEM_INSTRUCTION = `Tu es Eduque moi, un assistant IA développé par Evisions. Ta mission principale est d'aider les utilisateurs à apprendre et à améliorer leurs compétences dans divers domaines.

**Tes compétences clés sont les suivantes :**

* **Compréhension et génération de texte :** Tu maîtrises parfaitement le français, qui est ta langue par défaut. Tu peux également comprendre et répondre dans n'importe quelle autre langue.
* **Analyse de documents :** Tu peux analyser des fichiers sous différents formats (texte, image, PDF, etc.) pour en extraire des informations, les résumer, les traduire, etc.
* **Assistance à la rédaction :** Tu peux aider les utilisateurs à rédiger des documents tels que des mémoires, des dissertations, des rapports, etc. Tu peux également corriger des épreuves et fournir des suggestions d'amélioration.
* **Synthèse et résumé :** Tu peux résumer des cours, des articles, des livres, etc. et en extraire les points clés.
* **Assistance à l'apprentissage :** Tu peux répondre aux questions des utilisateurs sur divers sujets, leur fournir des définitions, des explications, des exemples, etc.

**Ton style de communication doit être :**

* **Clair, concis et précis.**
* **Adapté au niveau de compréhension de l'utilisateur.**
* **Amical et encourageant.**

**Informations complémentaires :**

* Tu es capable d'apprendre de nouvelles choses et de t'adapter aux besoins spécifiques des utilisateurs.
* Tu es toujours en développement et tes capacités s'améliorent constamment.
* Tu es conçu pour être un outil d'apprentissage et ne dois pas être utilisé à des fins illégales ou malveillantes.

**Exemple d'utilisation :**

Un utilisateur peut te demander de :

* "Résumer ce document PDF sur l'histoire de France."
* "M'aider à rédiger l'introduction de mon mémoire sur l'intelligence artificielle."
* "Corriger les fautes d'orthographe et de grammaire dans cette dissertation."
* "Me donner des exemples d'utilisation de la loi de Newton."

Voici une annonce : Ton numéro passe de 8 à 10 chiffres 

Comment faire pour changer en un clic tous les contacts d'un répertoire ?🤔

Evisions vous propose une solution digitale entièrement gratuite. Vous pouvez l'explorer dès maintenant afin d'assurer cette transition dans les prochains jours.

Demo: https://youtube.com/shorts/lWCeK6ndraA?si=EqMufbBIa0JVhgSH

Essayez cette solution ici : https://econtacts.netlify.app/

Nous joindre : +229 60374877 

Tu vas leur parler de l'annonce subtilement et les amener a poser de question dessus sans degrader leur experience conversation.

N'hésite pas à poser des questions à l'utilisateur pour clarifier ses besoins et lui fournir la meilleure assistance possible.`;

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCvizcYorGDPN3GXqma0opp7wAiMkaCt64",
    authDomain: "gemini-bb56e.firebaseapp.com",
    databaseURL: "https://gemini-bb56e-default-rtdb.firebaseio.com",
    projectId: "gemini-bb56e",
    storageBucket: "gemini-bb56e.appspot.com",
    messagingSenderId: "277143630015",
    appId: "1:277143630015:web:78736f2cf52d29495d160a",
    measurementId: "G-CSN292219J"
};

// Initialiser Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let prompts = {};
let pinnedPrompt = null;
let pinnedResponses = []; // Tableau pour stocker les réponses épinglées

// Configuration de l'API Gemini
let genAI;
const API_KEY_LIST_REF = db.ref('API');
let apiKeyList = [];


// Fonction pour charger la liste des clés API au chargement de la page
async function loadApiKeyList() {
    try {
        const snapshot = await API_KEY_LIST_REF.once('value');
        const data = snapshot.val();
        if (data) {
            apiKeyList = Object.values(data); // Convertir l'objet en tableau
        } else {
            console.warn("Aucune clé API trouvée dans la base de données.");
        }
    } catch (error) {
        console.error("Erreur lors du chargement de la liste des clés API:", error);
    }
}

// Fonction pour obtenir une clé API aléatoire
function getRandomApiKey() {
    if (apiKeyList.length === 0) {
        console.error("La liste des clés API est vide.");
        return null; // Ou gérer l'erreur différemment
    }
    const randomIndex = Math.floor(Math.random() * apiKeyList.length);
    return apiKeyList[randomIndex];
}

// Fonction pour obtenir la prochaine clé API dans la rotation
function getNextApiKey() {
    if (apiKeyList.length === 0) {
        console.error("La liste des clés API est vide.");
        return null;
    }
    
    // Obtenir la clé actuelle
    const currentKey = apiKeyList[currentApiKeyIndex];
    
    // Passer à la clé suivante
    currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeyList.length;
    
    return currentKey;
}

// Fonction pour initialiser la rotation des clés API
function initializeApiKeyRotation() {
    // Première initialisation
    if (apiKeyList.length > 0) {
        genAI = new GoogleGenerativeAI(getNextApiKey());
    }

    // Mettre en place la rotation automatique toutes les 5 secondes
    setInterval(() => {
        const newKey = getNextApiKey();
        if (newKey) {
            genAI = new GoogleGenerativeAI(newKey);
            console.log("Rotation de la clé API effectuée");
            
            // Réinitialiser le modèle avec la nouvelle clé
            model = genAI.getGenerativeModel({
                model: document.getElementById('modelSelect').value,
                systemInstruction: SYSTEM_INSTRUCTION
            });
        }
    }, 5000); // 5000 ms = 5 secondes
}

// Modifier la fonction initializeGeminiAPI existante
function initializeGeminiAPI() {
    const apiKey = getNextApiKey();
    if (apiKey) {
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
            model: document.getElementById('modelSelect').value,
            systemInstruction: SYSTEM_INSTRUCTION
        });
    } else {
        showNotification("Erreur : Impossible d'initialiser l'API. Aucune clé API disponible.", 'error');
    }
}


// Classe pour gérer les erreurs d'API
class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}

// Gestionnaire de clés API avec retry
class ApiKeyManager {
    constructor(apiKeys) {
        this.apiKeys = apiKeys;
        this.currentIndex = 0;
        this.usedKeys = new Set();
    }

    // Obtenir la prochaine clé non utilisée
    getNextUnusedKey() {
        const startIndex = this.currentIndex;
        
        do {
            this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
            if (!this.usedKeys.has(this.apiKeys[this.currentIndex])) {
                return this.apiKeys[this.currentIndex];
            }
        } while (this.currentIndex !== startIndex);

        return null; // Toutes les clés ont été essayées
    }

    // Réinitialiser les clés utilisées
    resetUsedKeys() {
        this.usedKeys.clear();
    }

    // Marquer une clé comme utilisée
    markKeyAsUsed(key) {
        this.usedKeys.add(key);
    }
}

// Fonction pour effectuer une requête avec retry
async function executeWithRetry(requestFunction) {
    const apiKeyManager = new ApiKeyManager(apiKeyList);
    let lastError = null;
    let attempts = 0;

    while (attempts < RETRY_CONFIG.maxAttempts) {
        const apiKey = apiKeyManager.getNextUnusedKey();
        
        if (!apiKey) {
            throw new Error("Toutes les clés API ont été épuisées sans succès");
        }

        try {
            // Initialiser l'API avec la nouvelle clé
            genAI = new GoogleGenerativeAI(apiKey);
            model = genAI.getGenerativeModel({
                model: document.getElementById('modelSelect').value,
                systemInstruction: SYSTEM_INSTRUCTION
            });

            // Exécuter la requête
            const result = await requestFunction();
            console.log(`Requête réussie avec la clé API ${apiKey}`);
            return result;

        } catch (error) {
            lastError = error;
            apiKeyManager.markKeyAsUsed(apiKey);
            attempts++;

            console.log(`Échec de la requête avec la clé API ${apiKey}. Tentative ${attempts}/${RETRY_CONFIG.maxAttempts}`);

            // Si ce n'est pas la dernière tentative, attendre avant de réessayer
            if (attempts < RETRY_CONFIG.maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
            }
        }
    }

    // Si toutes les tentatives ont échoué
    throw new Error(`Échec après ${attempts} tentatives. Dernière erreur: ${lastError.message}`);
}


// Fonction utilitaire pour vérifier si une erreur justifie un retry
function shouldRetry(error) {
    // Liste des codes d'erreur qui justifient un retry
    const retryableErrors = [
        'RESOURCE_EXHAUSTED',
        'UNAVAILABLE',
        'DEADLINE_EXCEEDED',
        'INTERNAL',
        'CANCELLED'
    ];

    return retryableErrors.includes(error.code) || 
           error.message.includes('quota exceeded') ||
           error.message.includes('rate limit') ||
           error.status === 429 || // Too Many Requests
           error.status >= 500;    // Server Errors
}

// Fonction pour créer et positionner le pointeur
function createPointer() {
    const pointer = document.createElement('div');
    pointer.classList.add('tour-icon');
    pointer.innerHTML = '👆';
    pointer.style.position = 'absolute';
    pointer.style.display = 'none';
    document.body.appendChild(pointer);
    return pointer;
}

// Fonction pour positionner le pointeur sur un élément
function positionPointer(pointer, element) {
    const rect = element.getBoundingClientRect();
    pointer.style.left = `${rect.left + rect.width / 2}px`;
    pointer.style.top = `${rect.top + rect.height / 2}px`;
    pointer.style.display = 'block';
}

// Fonction pour mettre en évidence un élément
function highlightElement(element) {
    element.classList.add('tour-highlight');
}

// Fonction pour retirer la mise en évidence d'un élément
function removeHighlight(element) {
    element.classList.remove('tour-highlight');
}

// Fonction pour démarrer la visite guidée
function startGuidedTour() {
    const pointer = createPointer();

    const tour = new Shepherd.Tour({
        defaultStepOptions: {
            cancelIcon: {
                enabled: true
            },
            classes: 'shepherd-theme-custom',
            scrollTo: { behavior: 'smooth', block: 'center' }
        }
    });

    const steps = [
        {
            id: 'welcome',
            text: 'Bienvenue sur Eduque moi ! Commençons la visite guidée.',
            attachTo: {
                element: '.logo',
                on: 'bottom'
            }
        },
        {
            id: 'menu',
            text: 'Voici le menu principal. Il vous permet d\'accéder à différentes fonctionnalités de l\'application (Models, Crédits, Bibliothèque, Récompense...).',
            attachTo: {
                element: '.toggle-sidebar',
                on: 'right'
            },
            beforeShow: () => {
                const menuButton = document.querySelector('.toggle-sidebar');
                highlightElement(menuButton);
                // Ouvrir le menu si ce n'est pas déjà fait
                const sidebar = document.querySelector('.sidebar');
                if (!sidebar.classList.contains('visible')) {
                    menuButton.click();
                }
            },
            beforeHide: () => {
                const menuButton = document.querySelector('.toggle-sidebar');
                removeHighlight(menuButton);
            }
        },
        {
            id: 'input-area',
            text: 'Voici la zone de saisie. C\'est ici que vous poserez vos questions.',
            attachTo: {
                element: '.input-container',
                on: 'top'
            }
        },
        {
            id: 'file-upload',
            text: 'Cliquez ici pour importer des fichiers (image, pdf, docx, doc, txt) que vous voulez analyser.',
            attachTo: {
                element: '.file-label',
                on: 'top'
            }
        },
        {
            id: 'prompt-list',
            text: 'Ce bouton ouvre la liste des demandes personnalisées (Utile si vous ne savez pas comment faire une demande).',
            attachTo: {
                element: '#promptListButton',
                on: 'top'
            }
        },
        {
            id: 'send-button',
            text: 'Cliquez ici pour envoyer votre message.',
            attachTo: {
                element: '.input-actions button:last-child',
                on: 'top'
            }
        },
        {
            id: 'message-actions',
            text: 'Ces icônes vous permettent de copier, exporter en PDF, partager ou répondre à un message spécifique.',
            attachTo: {
                element: '.message-actions',
                on: 'bottom'
            }
        }
    ];

    steps.forEach((step, index) => {
        tour.addStep({
            ...step,
            buttons: [
                {
                    text: index === steps.length - 1 ? 'Terminer' : 'Suivant',
                    action: index === steps.length - 1 ? tour.complete : tour.next
                }
            ],
            beforeShow: () => {
                const element = document.querySelector(step.attachTo.element);
                if (element) {
                    positionPointer(pointer, element);
                }
                if (step.beforeShow) {
                    step.beforeShow();
                }
            },
            beforeHide: () => {
                pointer.style.display = 'none';
            }
        });
    });

    tour.on('complete', () => {
        pointer.remove();
        // Fermer le menu si ouvert
        const sidebar = document.querySelector('.sidebar');
        if (sidebar.classList.contains('visible')) {
            document.querySelector('.toggle-sidebar').click();
        }
    });

    tour.start();
}

// Fonction pour vérifier si l'utilisateur a déjà vu la visite guidée
async function checkGuidedTourStatus(username) {
    const userRef = db.ref('users/' + username);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();
    return userData && userData.hasSeenGuidedTour;
}

// Fonction pour marquer la visite guidée comme vue
async function markGuidedTourAsSeen(username) {
    const userRef = db.ref('users/' + username);
    await userRef.update({ hasSeenGuidedTour: true });
}

// Fonction pour vérifier et mettre à jour le statut de l'abonnement
async function checkSubscriptionStatus() {
    if (!currentUser || !currentUser.subscriptionEndDate) return;

    const now = new Date();
    const endDate = new Date(currentUser.subscriptionEndDate);

    if (now > endDate) {
        currentUser.subscription = null;
        currentUser.subscriptionEndDate = null;
        await syncUserData();
        showNotification("Votre abonnement a expiré.", 'info');
        updateUIForLoggedInUser();
    } else if (now > new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000)) {
        // Notification 3 jours avant l'expiration
        const daysLeft = Math.ceil((endDate - now) / (24 * 60 * 60 * 1000));
        showNotification(`Votre abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`, 'warning');
    }
}

// Fonction pour générer une facture en PDF
function generateInvoicePDF(transaction) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Facture Eduque moi", 105, 20, null, null, "center");
    
    doc.setFontSize(12);
    doc.text(`Facture pour : ${currentUser.username}`, 20, 40);
    doc.text(`Date : ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Description : ${transaction.description}`, 20, 60);
    doc.text(`Montant : ${transaction.amount} FCFA`, 20, 70);
    doc.text(`Numéro de transaction : ${transaction.id}`, 20, 80);
    
    return doc;
}

// Fonction pour afficher la fenêtre flottante des détails de la facture
function showInvoiceDetails(transaction) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Détails de la facture</h2>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Description:</strong> ${transaction.description}</p>
            <p><strong>Montant:</strong> ${transaction.amount} FCFA</p>
            <p><strong>Numéro de transaction:</strong> ${transaction.id}</p>
            <button id="downloadInvoice">Télécharger la facture en PDF</button>
            <button id="closeModal">Fermer</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('downloadInvoice').addEventListener('click', () => {
        const doc = generateInvoicePDF(transaction);
        doc.save(`facture_${transaction.id}.pdf`);
    });

    document.getElementById('closeModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

function initializeNewDiscussion() {
    currentConversation = [];
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = '';
    addMessageToChat('ai', 'Bienvenue dans une nouvelle conversation ! Comment puis-je vous aider aujourd\'hui ?');
    updateConversationHistory();
}

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
}

function showRegisterModal() {
    document.getElementById('registerModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function updateUIForLoggedInUser() {
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('registerBtn').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('username').textContent = currentUser.username;
    document.getElementById('freeCredits').textContent = currentUser.freeCredits;
    document.getElementById('paidCredits').textContent = currentUser.paidCredits;
    document.getElementById('subscription').textContent = currentUser.subscription || 'Aucun';
    loadConversationHistory();
}

function updateUIForLoggedOutUser() {
    document.getElementById('loginBtn').classList.remove('hidden');
    document.getElementById('registerBtn').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
    document.getElementById('userInfo').classList.add('hidden');
    document.getElementById('conversationHistory').innerHTML = '<h3>Historique des conversations</h3>';
}

function storeLoginInfo(username, password) {
    localStorage.setItem('eduqueMoiUsername', username);
    localStorage.setItem('eduqueMoiPassword', password);
}

function getStoredLoginInfo() {
    return {
        username: localStorage.getItem('eduqueMoiUsername'),
        password: localStorage.getItem('eduqueMoiPassword')
    };
}

function clearLoginInfo() {
    localStorage.removeItem('eduqueMoiUsername');
    localStorage.removeItem('eduqueMoiPassword');
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const referralCode = new URLSearchParams(window.location.search).get('ref');
    
    if (!username || !password) {
        showNotification('Veuillez remplir tous les champs.', 'error');
        return;
    }

    try {
        const userRef = db.ref('users/' + username);
        const snapshot = await userRef.once('value');
        if (snapshot.exists()) {
            showNotification('Ce nom d\'utilisateur existe déjà.', 'error');
            return;
        }
        
        const now = new Date();
        const userData = {
            password: password,
            freeCredits: FREE_CREDITS_REGISTER,
            paidCredits: 0,
            subscription: null,
            subscriptionEndDate: null,
            lastFreeCreditsReset: now.toISOString(),
            referredBy: referralCode || null,
            firstPurchase: false,
            totalReferrals: 0,
            activeReferrals: 0,
            hasSeenGuidedTour: false // Ajout d'un champ pour suivre l'état de la visite guidée
        };
        
        await userRef.set(userData);
        
        if (referralCode) {
            const referrerQuery = await db.ref('users').orderByChild('referralCode').equalTo(referralCode).once('value');
            const referrer = referrerQuery.val();
            if (referrer) {
                const referrerUsername = Object.keys(referrer)[0];
                await db.ref(`users/${referrerUsername}/referrals/${username}`).set({
                    date: now.toISOString(),
                    isActive: false
                });
                
                const referrerRef = db.ref(`users/${referrerUsername}`);
                await referrerRef.transaction((user) => {
                    if (user) {
                        user.totalReferrals = (user.totalReferrals || 0) + 1;
                    }
                    return user;
                });
                
                if (currentUser && currentUser.username === referrerUsername) {
                    document.getElementById('totalReferrals').textContent = (parseInt(document.getElementById('totalReferrals').textContent) || 0) + 1;
                }
            }
        }
        
        currentUser = { username, ...userData };
        updateUIForLoggedInUser();
        showNotification('Inscription réussie ! Vous avez reçu 10 crédits gratuits.', 'success');
        closeModal('registerModal');
        storeLoginInfo(username, password);

        // Démarrer la visite guidée pour le nouvel utilisateur
        startGuidedTour();
        
        // Marquer la visite guidée comme vue
        await markGuidedTourAsSeen(username);

    } catch (error) {
        console.error('Erreur lors de l\'inscription:', error);
        showNotification('Erreur lors de l\'inscription. Veuillez réessayer.', 'error');
    }
}

async function login(username, password) {
    if (!username || !password) {
        username = document.getElementById('loginUsername').value;
        password = document.getElementById('loginPassword').value;
    }
    
    if (!username || !password) {
        showNotification('Veuillez remplir tous les champs.', 'error');
        return;
    }

    try {
        const userRef = db.ref('users/' + username);
        const snapshot = await userRef.once('value');
        if (snapshot.exists() && snapshot.val().password === password) {
            const userData = snapshot.val();
            
            // Initialisation des données utilisateur
            currentUser = { 
                username,
                freeCredits: userData.freeCredits || 0,
                paidCredits: userData.paidCredits || 0,
                subscription: userData.subscription || null,
                subscriptionEndDate: userData.subscriptionEndDate || null,
                lastFreeCreditsReset: userData.lastFreeCreditsReset || new Date().toISOString(),
                referralCode: userData.referralCode || null,
                totalReferrals: userData.totalReferrals || 0,
                activeReferrals: userData.activeReferrals || 0
            };

            // Réinitialiser les crédits gratuits si nécessaire
            await resetFreeCreditsIfNeeded();

            // Vérifier le statut de l'abonnement
            await checkSubscriptionStatus();

            // Initialiser le suivi des générations d'images
            await initializeImageGenerationTracking(username);

            // Mettre à jour l'interface utilisateur
            updateUIForLoggedInUser();

            // Sauvegarder les informations de connexion
            storeLoginInfo(username, password);

            // Charger l'historique des conversations
            loadConversationHistory();

            // Vérifier si l'utilisateur a déjà vu la visite guidée
            const hasSeenTour = await checkGuidedTourStatus(username);
            if (!hasSeenTour) {
                // Démarrer la visite guidée
                startGuidedTour();
                // Marquer la visite guidée comme vue
                await markGuidedTourAsSeen(username);
            }

            // Mise à jour des statistiques de parrainage
            if (userData.referrals) {
                await updateReferralStats(username);
            }

            // Initialiser le suivi des fichiers importés
            importedFilesCount = userData.importedFilesCount || 0;
            lastImportReset = new Date(userData.lastImportReset || new Date());

            // Synchroniser les données utilisateur
            await syncUserData();

            showNotification('Connexion réussie !', 'success');
            closeModal('loginModal');

            // Charger les prompts personnalisés de l'utilisateur s'ils existent
            if (userData.customPrompts) {
                loadCustomPrompts(userData.customPrompts);
            }

            // Vérifier les notifications en attente
            checkPendingNotifications();

            // Initialiser l'API avec les paramètres de l'utilisateur
            initializeGeminiAPI();

            // Créer une nouvelle conversation
            createNewConversation();

        } else {
            showNotification('Nom d\'utilisateur ou mot de passe incorrect.', 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        showNotification('Erreur lors de la connexion. Veuillez réessayer.', 'error');
    }
}

// Fonction auxiliaire pour vérifier les notifications en attente
async function checkPendingNotifications() {
    if (currentUser.subscription) {
        const endDate = new Date(currentUser.subscriptionEndDate);
        const now = new Date();
        const daysUntilExpiration = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiration <= 3 && daysUntilExpiration > 0) {
            showNotification(`Votre abonnement expire dans ${daysUntilExpiration} jour${daysUntilExpiration > 1 ? 's' : ''}.`, 'warning');
        }
    }

    // Vérifier les crédits faibles
    if (!currentUser.subscription && currentUser.paidCredits < 10 && currentUser.freeCredits < 3) {
        showNotification('Vos crédits sont faibles. Pensez à recharger votre compte.', 'warning');
    }
}

// Fonction auxiliaire pour charger les prompts personnalisés
function loadCustomPrompts(customPrompts) {
    if (Array.isArray(customPrompts)) {
        customPrompts.forEach(prompt => {
            if (!prompts[prompt.id]) {
                prompts[prompt.id] = prompt;
            }
        });
    }
}

function logout() {
    if (currentUser) {
        syncUserData();
    }
    currentUser = null;
    updateUIForLoggedOutUser();
    showNotification('Déconnexion réussie.', 'success');
    clearLoginInfo();
}

async function resetFreeCreditsIfNeeded() {
    const now = new Date();
    const lastReset = new Date(currentUser.lastFreeCreditsReset);
    if (now.getTime() - lastReset.getTime() >= 24 * 60 * 60 * 1000) {
        const previousCredits = currentUser.freeCredits;
        currentUser.freeCredits = FREE_CREDITS_PER_DAY;
        currentUser.lastFreeCreditsReset = now.toISOString();
        await syncUserData();
        document.getElementById('freeCredits').textContent = currentUser.freeCredits;
        // Notifier l'utilisateur
        const newCredits = currentUser.freeCredits - previousCredits;
        if (newCredits > 0) {
            showNotification(`${newCredits} crédits gratuits ont été ajoutés à votre compte !`, 'success');
        }
    }
}

// Modification de la fonction checkModelAccess
async function checkModelAccess() {
    const selectedModel = document.getElementById('modelSelect').value;
    const imageSizeSelect = document.getElementById('imageSizeSelect');
    
    // Afficher/masquer le sélecteur de taille d'image
    imageSizeSelect.style.display = isImageGenerationModel(selectedModel) ? 'block' : 'none';

    if (isImageGenerationModel(selectedModel)) {
        if (!hasValidSubscription() && currentUser.paidCredits < 5 && currentUser.freeCredits < 5) {
            showPaymentNotification('La génération d\'images nécessite 5 crédits.');
            document.getElementById('modelSelect').value = 'gemini-1.5-flash';
            imageSizeSelect.style.display = 'none';
            return;
        }
    } else if (!['gemini-1.5-flash', 'gemini-1.0-pro'].includes(selectedModel) && 
               !hasValidSubscription() && 
               currentUser.paidCredits <= 0) {
        showPaymentNotification('Ce modèle nécessite un abonnement ou des crédits payants.');
        document.getElementById('modelSelect').value = 'gemini-1.5-flash';
    }
}


// Fonction pour gérer l'importation de fichiers (docx, doc)
async function handleFileUpload(event) {
    const files = event.target.files;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'application/msword') {

            try {
                const textContent = await convertWordToText(file);
                
                // Ajouter le contenu texte aux fichiers épinglés
                pinnedFiles.push({
                    name: file.name.replace(/\.[^/.]+$/, "") + '.txt', // Remplace l'extension par .txt
                    type: 'text/plain',
                    content: textContent
                });
                updatePinnedFiles();
                
                // Incrémenter le compteur de fichiers importés et mettre à jour la base de données
                importedFilesCount++;
                await db.ref('users/' + currentUser.username).update({
                    importedFilesCount: importedFilesCount
                });

            } catch (error) {
                console.error('Erreur lors de la conversion du fichier Word :', error);
                showNotification('Erreur lors de la conversion du fichier Word.', 'error');
            }
        } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            // Gestion des fichiers image et PDF comme avant
            pinnedFiles.push(file);
            updatePinnedFiles();
        }
    }
}

// Fonction pour convertir un fichier Word en texte
function convertWordToText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const arrayBuffer = e.target.result;
            mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                .then(function (result) {
                    resolve(result.value);
                })
                .catch(function (error) {
                    reject(error);
                });
        };
        reader.readAsArrayBuffer(file);
    });
}

// Fonction pour mettre à jour l'affichage des fichiers épinglés
function updatePinnedFiles() {
    const pinnedItems = document.getElementById('pinnedItems');
    pinnedItems.innerHTML = '';
    pinnedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.innerHTML = `
            <span class="icon">${file.type.startsWith('image/') ? '🖼️' : '📄'}</span>
            <span class="name" title="${file.name}">${file.name}</span>
            <span class="remove" onclick="removePinnedFile(${index})">❌</span>
        `;
        pinnedItems.appendChild(item);
    });
}

// Fonction pour supprimer un fichier épinglé
function removePinnedFile(index) {
    pinnedFiles.splice(index, 1);
    updatePinnedFiles();
}

function createPinnedFilesElement(files) {
    const pinnedFilesElement = document.createElement('div');
    pinnedFilesElement.className = 'pinned-files-message';

    files.forEach(file => {
        const fileElement = document.createElement('div');
        fileElement.className = 'pinned-file';

        if (file.type.startsWith('image/')) {
            const imgElement = document.createElement('img');
            imgElement.src = URL.createObjectURL(file);
            imgElement.alt = file.name;
            imgElement.className = 'pinned-image';
            fileElement.appendChild(imgElement);
        } else {
            const iconElement = document.createElement('span');
            iconElement.className = 'file-icon';
            iconElement.textContent = file.type.startsWith('application/pdf') ? '📄' : '📎';
            fileElement.appendChild(iconElement);
        }

        const nameElement = document.createElement('span');
        nameElement.className = 'file-name';
        nameElement.textContent = file.name;

        fileElement.appendChild(nameElement);
        pinnedFilesElement.appendChild(fileElement);
    });

    return pinnedFilesElement;
}

// Fonction pour créer un élément pour les réponses épinglées (similaire à createPinnedFilesElement)
function createPinnedResponsesElement(responses) {
    const pinnedResponsesElement = document.createElement("div");
    pinnedResponsesElement.className = "pinned-responses-message";
  
    responses.forEach((response) => {
      const responseElement = document.createElement("div");
      responseElement.className = "pinned-response";
  
      const iconElement = document.createElement("span");
      iconElement.className = "response-icon";
      iconElement.textContent = "💬";
  
      const textElement = document.createElement("span");
      textElement.className = "response-text";
      textElement.textContent = response.displayText;
  
      responseElement.appendChild(iconElement);
      responseElement.appendChild(textElement);
      pinnedResponsesElement.appendChild(responseElement);
    });
  
    return pinnedResponsesElement;
  }
  
  // Fonction pour créer un élément pour le prompt épinglé
  function createPinnedPromptElement(prompt) {
    const pinnedPromptElement = document.createElement("div");
    pinnedPromptElement.className = "pinned-prompt-message";
  
    const promptElement = document.createElement("div");
    promptElement.className = "pinned-prompt";
  
    const iconElement = document.createElement("span");
    iconElement.className = "prompt-icon";
    iconElement.textContent = "🤖";
  
    const titleElement = document.createElement("span");
    titleElement.className = "prompt-title";
    titleElement.textContent = prompt.title;
  
    promptElement.appendChild(iconElement);
    promptElement.appendChild(titleElement);
    pinnedPromptElement.appendChild(promptElement);
  
    return pinnedPromptElement;
  }
// Fonction pour créer l'en-tête du modèle
function createModelHeader(modelName) {
    // Convertir le nom technique du modèle en un nom plus lisible
    const modelDisplayNames = {
        'gemini-1.5-flash': 'Gemini 1.5 Flash',
        'gemini-1.5-pro': 'Gemini 1.5 Pro',
        'gemini-1.5-pro-latest': 'Gemini 1.5 Pro Latest',
        'gemini-1.0-pro': 'Gemini 1.0 Pro',
        'recraft-realistic': 'Image Réaliste',
        'recraft-digital': 'Illustration Digitale',
        'recraft-vector': 'Illustration Vectorielle'
    };

    const displayName = modelDisplayNames[modelName] || modelName;
    
    return `
        <div class="model-header">
            <div class="model-info">
                <i class="${isImageGenerationModel(modelName) ? 'fas fa-image' : 'fas fa-robot'}"></i>
                <span>${displayName}</span>
            </div>
        </div>
    `;
}

async function sendMessage() {
    if (!currentUser) {
        showNotification("Veuillez vous connecter pour envoyer des messages.", "error");
        return;
    }

    const userInput = document.getElementById("userInput").value.trim();
    const selectedModel = document.getElementById("modelSelect").value;

    if (!userInput && pinnedFiles.length === 0 && pinnedResponses.length === 0 && !pinnedPrompt) {
        showNotification(
            "Veuillez entrer un message, joindre un fichier, épingler une réponse ou sélectionner un prompt.",
            "error"
        );
        return;
    }

    // Construire le prompt final
    let finalPrompt = userInput;
    if (pinnedPrompt) {
        if (pinnedPrompt.type === 'image') {
            finalPrompt = `${pinnedPrompt.content}\nDétails spécifiques: ${userInput}`;
        } else {
            finalPrompt = `${pinnedPrompt.content}\n\n${userInput}`;
        }
    }

    // Fonction pour créer l'en-tête du modèle
    function createModelHeader(modelName) {
        const modelDisplayNames = {
            'gemini-1.5-flash': 'Gemini 1.5 Flash',
            'gemini-1.5-pro': 'Gemini 1.5 Pro',
            'gemini-1.5-pro-latest': 'Gemini 1.5 Pro Latest',
            'gemini-1.0-pro': 'Gemini 1.0 Pro',
            'recraft-realistic': 'Image Réaliste',
            'recraft-digital': 'Illustration Digitale',
            'recraft-vector': 'Illustration Vectorielle'
        };

        const displayName = modelDisplayNames[modelName] || modelName;
        return `
            <div class="model-header">
                <div class="model-info">
                    <i class="${isImageGenerationModel(modelName) ? 'fas fa-image' : 'fas fa-robot'}"></i>
                    <span>${displayName}</span>
                </div>
            </div>
        `;
    }

    // Traitement pour les modèles de génération d'image
    if (isImageGenerationModel(selectedModel)) {
        try {
            const generationStatus = await canGenerateImage();

            if (!generationStatus.canGenerate) {
                showPaymentNotification(generationStatus.message);
                return;
            }

            // Créer et afficher le message de chargement
            const loadingMessage = document.createElement('div');
            loadingMessage.className = 'message ai-message';
            loadingMessage.innerHTML = `
                ${createModelHeader(selectedModel)}
                <div class="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            `;
            document.getElementById('messageContainer').appendChild(loadingMessage);
            
            const imageSize = document.getElementById('imageSizeSelect').value;
            const style = getRecraftStyle(selectedModel);
            
            const response = await fetch('https://external.api.recraft.ai/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${RECRAFT_API_KEY}`
                },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    style: style,
                    size: imageSize
                })
            });

            if (!response.ok) {
                throw new Error('Erreur lors de la génération de l\'image');
            }

            const data = await response.json();
            const imageUrl = data.data[0].url;

            loadingMessage.innerHTML = `
                ${createModelHeader(selectedModel)}
                <img src="${imageUrl}" alt="Image générée" style="max-width: 100%; border-radius: 5px;">
                <p>Image générée à partir du prompt : "${finalPrompt}"</p>
                <div class="message-metadata">
                    <span class="generation-info">Style: ${style.replace('_', ' ').toUpperCase()}</span>
                    <span class="generation-info">Taille: ${imageSize}</span>
                    <span class="generation-info">
                        ${generationStatus.useFreeGeneration ? 
                          'Génération gratuite (abonnement)' : 
                          'Génération payante (5 crédits)'}
                    </span>
                </div>
                <div class="message-actions">
                    <button onclick="downloadImage('${imageUrl}', 'image-generee.png')">
                        <i class="fas fa-download"></i>
                    </button>
                    <button onclick="copyImage('${imageUrl}')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button onclick="shareImage('${imageUrl}')">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            `;

            if (generationStatus.useFreeGeneration) {
                await incrementImageGenerationCount(currentUser.username);
                const newCount = await getImageGenerationCount(currentUser.username);
                showNotification(`Image générée avec succès! Il vous reste ${5 - newCount} générations gratuites aujourd'hui.`, 'success');
            } else {
                await updateCredits(selectedModel, 5);
                showNotification('Image générée avec succès! 5 crédits ont été déduits.', 'success');
            }

        } catch (error) {
            console.error('Erreur de génération d\'image:', error);
            showNotification('Erreur lors de la génération de l\'image. Veuillez réessayer.', 'error');
        } finally {
            document.getElementById('userInput').value = '';
            resetTextareaHeight();
            pinnedPrompt = null;
            updatePinnedItems();
        }
        return;
    }

    // Traitement pour les modèles de texte
    let requiredCredits = 1;
    requiredCredits += pinnedFiles.filter(file => file.type !== 'text/plain').length;
    requiredCredits += pinnedResponses.length;

    if (!hasValidSubscription()) {
        if (selectedModel === "gemini-1.5-flash") {
            if (currentUser.paidCredits >= requiredCredits) {
                showNotification("Utilisation de crédits payants pour Gemini 1.5 Flash.", "info");
            } else if (currentUser.freeCredits >= requiredCredits) {
                showNotification("Utilisation de crédits gratuits pour Gemini 1.5 Flash.", "info");
            } else {
                showPaymentNotification("Vous n'avez pas assez de crédits pour utiliser Gemini 1.5 Flash.");
                return;
            }
        } else if (!["gemini-1.0-pro"].includes(selectedModel)) {
            if (currentUser.paidCredits < requiredCredits) {
                showPaymentNotification("Vous n'avez pas assez de crédits payants pour ce modèle avancé.");
                return;
            }
        } else if (currentUser.freeCredits < requiredCredits && currentUser.paidCredits < requiredCredits) {
            showPaymentNotification("Vous n'avez pas assez de crédits pour envoyer ce message.");
            return;
        }
    }

    let displayMessage = userInput;
    let fullMessage = userInput;

    const pinnedFilesToSend = [...pinnedFiles];
    const pinnedResponsesToSend = [...pinnedResponses];
    const pinnedPromptToSend = pinnedPrompt;

    pinnedFiles = [];
    pinnedResponses = [];
    pinnedPrompt = null;
    updatePinnedItems();

    // Message utilisateur
    const messageElement = document.createElement("div");
    messageElement.className = "message user-message";

    if (pinnedFilesToSend.length > 0) {
        const pinnedFilesElement = createPinnedFilesElement(pinnedFilesToSend);
        messageElement.appendChild(pinnedFilesElement);
        fullMessage += "\n\n**Fichiers joints:**\n";
        pinnedFilesToSend.forEach((file) => {
            fullMessage += `- ${file.name} (${file.type})\n`;
        });
    }

    if (pinnedResponsesToSend.length > 0) {
        const pinnedResponsesElement = createPinnedResponsesElement(pinnedResponsesToSend);
        messageElement.appendChild(pinnedResponsesElement);
        fullMessage += "\n\n**Réponses épinglées:**\n";
        pinnedResponsesToSend.forEach((response) => {
            fullMessage += `- ${response.text}\n`;
        });
    }

    if (pinnedPromptToSend) {
        const pinnedPromptElement = createPinnedPromptElement(pinnedPromptToSend);
        messageElement.appendChild(pinnedPromptElement);
        fullMessage = pinnedPromptToSend.content + "\n\n" + fullMessage;
    }

    if (displayMessage) {
        const textElement = document.createElement("p");
        textElement.textContent = displayMessage;
        messageElement.appendChild(textElement);
    }

    const messageContainer = document.getElementById("messageContainer");
    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    document.getElementById("userInput").value = "";
    resetTextareaHeight();

    // Message de chargement avec l'en-tête du modèle
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'message ai-message';
    loadingMessage.innerHTML = `
        ${createModelHeader(selectedModel)}
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    messageContainer.appendChild(loadingMessage);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    try {
        const parts = [];

        let conversationContext = "";
        const recentMessages = currentConversation.slice(-5);
        recentMessages.forEach((message) => {
            conversationContext += `${message.sender === "user" ? "user" : "model"}: ${message.content}\n`;
        });

        fullMessage = conversationContext + "\n" + fullMessage;
        parts.push({ text: fullMessage });

        for (const file of pinnedFilesToSend) {
            if (file.type === 'text/plain') {
                parts.push({ text: `Analyse ce fichier texte: ${file.content}` });
            } else {
                const fileData = await readFileAsBase64(file);
                parts.push({
                    inlineData: {
                        data: fileData,
                        mimeType: file.type,
                    }
                });
                parts.push({ text: `Analyse le fichier ${file.name} (${file.type}) que je viens de t'envoyer.` });
            }
        }

        model = genAI.getGenerativeModel({
            model: selectedModel,
            systemInstruction: SYSTEM_INSTRUCTION,
        });

        const result = await model.generateContent(parts);
        const response = await result.response;
        let aiResponse = response.text();

        if (selectedModel === "gemini-1.0-pro" || 
            (selectedModel === "gemini-1.5-flash" && currentUser.paidCredits < requiredCredits)) {
            const words = aiResponse.split(/\s+/);
            if (words.length > FREE_MODEL_MAX_RESPONSE) {
                aiResponse = words.slice(0, FREE_MODEL_MAX_RESPONSE).join(" ") +
                    "...(Utilisez un modèle avancé pour avoir la suite de ma réponse)";
                showNotification(`La réponse a été tronquée à ${FREE_MODEL_MAX_RESPONSE} mots.`, "info");
            }
        }

        // Conserver l'en-tête du modèle et animer la réponse
        const modelHeader = loadingMessage.querySelector('.model-header');
        loadingMessage.innerHTML = '';
        loadingMessage.appendChild(modelHeader);
        
        await animateText(loadingMessage, aiResponse);
        
        currentConversation.push({ sender: "user", content: userInput });
        currentConversation.push({ sender: "ai", content: aiResponse });

        await updateCredits(selectedModel, requiredCredits);
        saveConversation();

    } catch (error) {
        console.error("Erreur lors de la génération de la réponse:", error);
        loadingMessage.remove();
        showNotification(`Erreur : ${error.message}. Veuillez réessayer.`, "error");
    }
}

// Fonctions auxiliaires

function resetPinnedItems() {
    pinnedFiles = [];
    pinnedResponses = [];
    pinnedPrompt = null;
    updatePinnedItems();
}

function buildConversationContext() {
    let context = "";
    const recentMessages = currentConversation.slice(-5);
    recentMessages.forEach((message) => {
        context += `${message.sender === "user" ? "user" : "model"}: ${message.content}\n`;
    });
    return context;
}

async function addFilesToParts(parts, files) {
    for (const file of files) {
        if (file.type === 'text/plain') {
            parts.push({ text: `Analyse ce fichier texte: ${file.content}` });
        } else {
            const fileData = await readFileAsBase64(file);
            parts.push({
                inlineData: {
                    data: fileData,
                    mimeType: file.type,
                }
            });
            parts.push({ text: `Analyse le fichier ${file.name} (${file.type}).` });
        }
    }
}

async function validateCreditsAndModel(selectedModel, requiredCredits) {
    if (selectedModel === "gemini-1.5-flash") {
        if (currentUser.paidCredits >= requiredCredits) {
            showNotification("Utilisation de crédits payants pour Gemini 1.5 Flash.", "info");
            return true;
        } else if (currentUser.freeCredits >= requiredCredits) {
            showNotification("Utilisation de crédits gratuits pour Gemini 1.5 Flash.", "info");
            return true;
        }
    } else if (!["gemini-1.0-pro"].includes(selectedModel)) {
        if (currentUser.paidCredits < requiredCredits) {
            showPaymentNotification("Vous n'avez pas assez de crédits payants pour ce modèle avancé.");
            return false;
        }
    } else {
        if (currentUser.freeCredits < requiredCredits && currentUser.paidCredits < requiredCredits) {
            showPaymentNotification("Vous n'avez pas assez de crédits pour envoyer ce message.");
            return false;
        }
    }
    return true;
}

async function processAndDisplayAIResponse(aiResponse, selectedModel, requiredCredits) {
    let aiMessageElement;
    if (selectedModel === "gemini-1.0-pro" || 
        (selectedModel === "gemini-1.5-flash" && currentUser.paidCredits < requiredCredits)) {
        
        const words = aiResponse.split(/\s+/);
        if (words.length > FREE_MODEL_MAX_RESPONSE) {
            aiResponse = words.slice(0, FREE_MODEL_MAX_RESPONSE).join(" ") +
                "...(Utilisez un modèle avancé pour avoir la suite de ma réponse)";
            showNotification(`La réponse a été tronquée à ${FREE_MODEL_MAX_RESPONSE} mots.`, "info");
            aiMessageElement = addMessageToChat("ai", aiResponse);
            showUpgradeButton(aiMessageElement);
        } else {
            aiMessageElement = addMessageToChat("ai", aiResponse);
        }
    } else {
        aiMessageElement = addMessageToChat("ai", aiResponse);
    }
    return aiMessageElement;
}

function updateConversation(userInput, aiResponse) {
    currentConversation.push({ sender: "user", content: userInput });
    currentConversation.push({ sender: "ai", content: aiResponse });
}

// Fonction corrigée pour la génération d'images
async function handleImageGeneration(userInput, selectedModel, generationStatus) {
    try {
        // Vérifier si l'utilisateur a les crédits nécessaires
        if (!generationStatus.canGenerate) {
            showPaymentNotification(generationStatus.message);
            return;
        }

        const imageSize = document.getElementById('imageSizeSelect').value;
        const style = getRecraftStyle(selectedModel);
        
        // Afficher l'indicateur de chargement
        const loadingMessage = addLoadingMessage('Génération de l\'image en cours...');
        
        const response = await fetch('https://api.recraft.ai/api/v2/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RECRAFT_API_KEY}`
            },
            body: JSON.stringify({
                prompt: userInput,
                style: style,
                size: imageSize,
                // nombre d'images à générer (par défaut 1)
                n: 1
            })
        });

        // Supprimer le message de chargement
        loadingMessage.remove();

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }

        const data = await response.json();
        if (!data.data || !data.data[0] || !data.data[0].url) {
            throw new Error('Format de réponse invalide de l\'API Recraft');
        }

        const imageUrl = data.data[0].url;

        // Créer un message avec l'image générée
        const messageElement = document.createElement('div');
        messageElement.className = 'message ai-message';
        messageElement.innerHTML = `
            <img src="${imageUrl}" alt="Image générée" style="max-width: 100%; border-radius: 5px;">
            <p>Image générée à partir du prompt : "${userInput}"</p>
            <div class="message-metadata">
                <span class="generation-info">Style: ${style.replace('_', ' ').toUpperCase()}</span>
                <span class="generation-info">Taille: ${imageSize}</span>
                <span class="generation-info">
                    ${generationStatus.useFreeGeneration ? 
                      'Génération gratuite (abonnement)' : 
                      'Génération payante (5 crédits)'}
                </span>
            </div>
            <div class="message-actions">
                <button onclick="downloadImage('${imageUrl}', 'image-generee.png')">
                    <i class="fas fa-download"></i>
                </button>
                <button onclick="copyImage('${imageUrl}')">
                    <i class="fas fa-copy"></i>
                </button>
                <button onclick="shareImage('${imageUrl}')">
                    <i class="fas fa-share-alt"></i>
                </button>
            </div>
        `;

        document.getElementById('messageContainer').appendChild(messageElement);
        
        // Mettre à jour les compteurs et crédits
        if (generationStatus.useFreeGeneration) {
            await incrementImageGenerationCount(currentUser.username);
            const newCount = await getImageGenerationCount(currentUser.username);
            showNotification(`Image générée avec succès! Il vous reste ${5 - newCount} générations gratuites aujourd'hui.`, 'success');
        } else {
            await updateCredits(selectedModel, 5);
            showNotification('Image générée avec succès! 5 crédits ont été déduits.', 'success');
        }
        
        // Réinitialiser l'input
        document.getElementById('userInput').value = '';
        resetTextareaHeight();

    } catch (error) {
        console.error('Erreur lors de la génération d\'image:', error);
        showNotification('Erreur lors de la génération de l\'image. Veuillez réessayer.', 'error');
    }
}



function createUserMessageElement(displayMessage, pinnedFiles, pinnedResponses, pinnedPrompt) {
    const messageElement = document.createElement("div");
    messageElement.className = "message user-message";

    if (pinnedFiles.length > 0) {
        messageElement.appendChild(createPinnedFilesElement(pinnedFiles));
    }

    if (pinnedResponses.length > 0) {
        messageElement.appendChild(createPinnedResponsesElement(pinnedResponses));
    }

    if (pinnedPrompt) {
        messageElement.appendChild(createPinnedPromptElement(pinnedPrompt));
    }

    if (displayMessage) {
        const textElement = document.createElement("p");
        textElement.textContent = displayMessage;
        messageElement.appendChild(textElement);
    }

    return messageElement;
}

// Fonctions utilitaires pour la manipulation des images générées
function addLoadingMessage(text) {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'message ai-message loading-message';
    loadingElement.innerHTML = `
        <div class="loading-spinner"></div>
        <p>${text}</p>
    `;
    document.getElementById('messageContainer').appendChild(loadingElement);
    return loadingElement;
}

async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        showNotification('Erreur lors du téléchargement de l\'image.', 'error');
    }
}

function copyImage(url) {
    navigator.clipboard.writeText(url)
        .then(() => showNotification('Lien de l\'image copié dans le presse-papiers!', 'success'))
        .catch(() => showNotification('Erreur lors de la copie du lien.', 'error'));
}

function shareImage(url) {
    if (navigator.share) {
        navigator.share({
            title: 'Image générée par Eduque moi',
            text: 'Regardez cette image générée par IA!',
            url: url
        })
        .then(() => showNotification('Image partagée avec succès!', 'success'))
        .catch((error) => {
            console.error('Erreur lors du partage:', error);
            showNotification('Erreur lors du partage de l\'image.', 'error');
        });
    } else {
        copyImage(url);
    }
}

// Fonction pour épingler une réponse à la barre de saisie
function pinResponse(messageElement) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    const truncatedText = responseText.length > 50 ? responseText.substring(0, 50) + '...' : responseText;

    pinnedResponses.push({
        text: responseText,
        displayText: truncatedText
    });
    updatePinnedItems();
}

// Fonction pour mettre à jour l'affichage des éléments épinglés (fichiers et réponses)
function updatePinnedItems() {
    const pinnedItems = document.getElementById('pinnedItems');
    pinnedItems.innerHTML = '';

    // Ajouter les fichiers épinglés
    pinnedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.setAttribute('data-type', 'file');
        item.innerHTML = `
            <span class="icon">${file.type.startsWith('image/') ? '🖼️' : '📄'}</span>
            <span class="name" title="${file.name}">${file.name}</span>
            <span class="remove" onclick="removePinnedItem('file', ${index})">❌</span>
        `;
        pinnedItems.appendChild(item);
    });

    // Ajouter les réponses épinglées
    pinnedResponses.forEach((response, index) => {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.setAttribute('data-type', 'response');
        item.innerHTML = `
            <span class="icon">💬</span>
            <span class="name" title="${response.text}">${response.displayText}</span>
            <span class="remove" onclick="removePinnedItem('response', ${index})">❌</span>
        `;
        pinnedItems.appendChild(item);
    });

    // Ajouter le prompt épinglé s'il existe
    if (pinnedPrompt) {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.setAttribute('data-type', 'prompt');
        item.innerHTML = `
            <span class="icon">🤖</span>
            <span class="name" title="${pinnedPrompt.title}">${pinnedPrompt.title}</span>
            <span class="remove" onclick="removePinnedItem('prompt')">❌</span>
        `;
        pinnedItems.appendChild(item);
    }
}

// Fonction pour supprimer un élément épinglé
function removePinnedItem(type, index) {
    if (type === 'file') {
        pinnedFiles.splice(index, 1);
    } else if (type === 'response') {
        pinnedResponses.splice(index, 1);
    } else if (type === 'prompt') {
        pinnedPrompt = null;
    }
    updatePinnedItems();
}



// Fonction pour répondre à un message spécifique
function replyToMessage(messageElement) {
    // Récupérer le contenu du message auquel on répond
    const messageToReplyTo = messageElement.querySelector('div:first-child').textContent;

    // Ajouter le contenu du message cité dans la zone de saisie
    const userInput = document.getElementById('userInput');
    userInput.value = `> ${messageToReplyTo}\n\n`; // Vous pouvez personnaliser le format de la citation

    // Placer le curseur à la fin du texte
    userInput.focus();
    userInput.setSelectionRange(userInput.value.length, userInput.value.length);
}

// Fonction pour lire un fichier en base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function hasEnoughCredits(model, fileCount) {
    const requiredCredits = fileCount > 0 ? fileCount : 1;
    
    if (model === 'gemini-1.5-flash' || model === 'gemini-1.0-pro') {
        // Modèles gratuits
        return currentUser.freeCredits >= requiredCredits || currentUser.paidCredits >= requiredCredits || hasValidSubscription();
    } else {
        // Modèles payants
        return currentUser.paidCredits >= requiredCredits || hasValidSubscription();
    }
}

async function updateCredits(model, requiredCredits) {
    // Ne pas retourner si c'est un modèle de texte pour un non-abonné
    if (hasValidSubscription() && !isImageGenerationModel(model)) return;

    // Mise à jour des crédits sur Firebase avec transaction
    const userRef = db.ref('users/' + currentUser.username);
    
    try {
        await userRef.transaction((userData) => {
            if (userData) {
                if (isImageGenerationModel(model)) {
                    // Logique pour les modèles de génération d'image
                    if (hasValidSubscription()) {
                        const imageCount = userData.imageGeneration?.dailyCount || 0;
                        if (imageCount >= 5) {
                            if (userData.paidCredits >= 5) {
                                userData.paidCredits -= 5;
                            } else {
                                userData.freeCredits = Math.max(0, userData.freeCredits - 5);
                            }
                        }
                    } else {
                        if (userData.paidCredits >= 5) {
                            userData.paidCredits -= 5;
                        } else {
                            userData.freeCredits = Math.max(0, userData.freeCredits - 5);
                        }
                    }
                } else {
                    // Logique pour les modèles de texte
                    if (!hasValidSubscription()) {  // Seulement pour les non-abonnés
                        if (model === 'gemini-1.5-flash') {
                            // Utiliser d'abord les crédits payants
                            if (userData.paidCredits >= requiredCredits) {
                                userData.paidCredits -= requiredCredits;
                            } else {
                                userData.freeCredits -= requiredCredits;
                            }
                        } else if (model === 'gemini-1.0-pro') {
                            // Utiliser d'abord les crédits gratuits
                            if (userData.freeCredits >= requiredCredits) {
                                userData.freeCredits -= requiredCredits;
                            } else {
                                const remainingCredits = requiredCredits - userData.freeCredits;
                                userData.freeCredits = 0;
                                userData.paidCredits = Math.max(0, userData.paidCredits - remainingCredits);
                            }
                        } else {
                            // Pour les autres modèles, utiliser uniquement les crédits payants
                            userData.paidCredits = Math.max(0, userData.paidCredits - requiredCredits);
                        }
                    }
                }

                // Maintenir les valeurs positives
                userData.freeCredits = Math.max(0, userData.freeCredits);
                userData.paidCredits = Math.max(0, userData.paidCredits);
            }
            return userData;
        });

        // Mise à jour des données locales
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();
        
        if (userData) {
            currentUser.freeCredits = userData.freeCredits;
            currentUser.paidCredits = userData.paidCredits;
            
            // Mise à jour de l'interface
            document.getElementById('freeCredits').textContent = currentUser.freeCredits;
            document.getElementById('paidCredits').textContent = currentUser.paidCredits;
            
            // Notification de crédits bas
            if (currentUser.freeCredits === 0 && currentUser.paidCredits < 5) {
                showNotification('Attention : vos crédits sont presque épuisés !', 'warning');
            }
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour des crédits:', error);
        showNotification('Erreur lors de la mise à jour des crédits', 'error');
    }
}

async function addCreditsToUser(amount) {
  // Mettre à jour les crédits sur Firebase en utilisant une transaction
  const userRef = db.ref('users/' + currentUser.username);
  await userRef.transaction((userData) => {
    if (userData) {
      userData.paidCredits += amount;
    }
    return userData;
  });

  // Mettre à jour les crédits en local à partir de Firebase
  currentUser.paidCredits = (await userRef.child('paidCredits').once('value')).val();
  document.getElementById('paidCredits').textContent = currentUser.paidCredits;
}



function copyResponse(messageElement) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    navigator.clipboard.writeText(responseText).then(() => {
        showNotification('Réponse copiée dans le presse-papiers', 'success');
    });
}

async function exportResponse(messageElement, format) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    if (format === 'word') {
        const blob = await generateWordDoc(responseText);
        saveAs(blob, "Eduque_moi.docx");
    } else if (format === 'pdf') {
        const blob = await generatePDF(responseText);
        saveAs(blob, "Eduque_moi.pdf");
    }
    showNotification(`Export en ${format.toUpperCase()} réussi`, 'success');
}

async function generateWordDoc(text) {
    const content = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p>
                    <w:r>
                        <w:t>${text}</w:t>
                    </w:r>
                </w:p>
            </w:body>
        </w:document>
    `;
    const zip = new PizZip();
    zip.file("word/document.xml", content);
    const blob = await zip.generateAsync({type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
    return blob;
}

function generatePDF(text) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("", 20, 20);
    
    doc.setFontSize(12);
    const splitText = doc.splitTextToSize(text, 170);
    
    let y = 30;
    const pageHeight = doc.internal.pageSize.height;
    
    for (let i = 0; i < splitText.length; i++) {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = 20;
        }
        doc.text(splitText[i], 20, y);
        y += 7;
    }
    
    return doc.output('blob');
}

function shareResponse(messageElement) {
    const responseText = messageElement.querySelector('div:first-child').textContent;
    if (navigator.share) {
        navigator.share({
            title: '',
            text: responseText
        }).then(() => {
            showNotification('Partage réussi', 'success');
        }).catch((error) => {
            console.error('Erreur lors du partage:', error);
            showNotification('Erreur lors du partage', 'error');
        });
    } else {
        showNotification('Le partage n\'est pas pris en charge sur votre appareil', 'error');
    }
}

function hasValidSubscription() {
    if (!currentUser.subscription || !currentUser.subscriptionEndDate) return false;
    return new Date() < new Date(currentUser.subscriptionEndDate);
}

function buySubscription() {
    const subscriptionType = document.getElementById('subscriptionSelect').value;
    if (!subscriptionType) {
        showNotification('Veuillez sélectionner un forfait.', 'error');
        return;
    }

    const subscriptionPrices = {
        '24h': 500, '3d': 1200, '7d': 2400, '30d': 8000, '3m': 20000
    };

    const price = subscriptionPrices[subscriptionType];

    var fedaPayInstance = FedaPay.init({
        public_key: 'pk_live_TfSz212W0xSMKK7oPEogkFmp',
        transaction: {
            amount: price,
            description: `Achat d'un forfait ${subscriptionType} pour Eduque moi`
        },
        customer: {
            email: 'client@example.com'
        },
        onComplete: async function(response) {
            if (response.reason === FedaPay.CHECKOUT_COMPLETED) {
                const transaction = {
                    id: response.id,
                    description: `Achat d'un forfait ${subscriptionType} pour Eduque moi`,
                    amount: price
                };
                await activateSubscription(subscriptionType);
                showInvoiceDetails(transaction);
                showNotification(`Forfait ${subscriptionType} activé avec succès !`, 'success');
                
            // Vérifier si c'est le premier achat et récompenser le parrain
            await checkFirstPurchaseAndRewardReferrer(currentUser.username, price);
            } else {
                showNotification('Le paiement a été annulé ou a échoué.', 'error');
            }
        }
    });
    fedaPayInstance.open();
}

async function activateSubscription(subscriptionType) {
    const durations = { '24h': 1, '3d': 3, '7d': 7, '30d': 30, '3m': 90 };
    const days = durations[subscriptionType];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    currentUser.subscription = subscriptionType;
    currentUser.subscriptionEndDate = endDate.toISOString();

    await syncUserData();

    document.getElementById('subscription').textContent = subscriptionType;
}

function buyCredits() {
    const creditAmount = document.getElementById('creditSelect').value;
    if (!creditAmount) {
        showNotification('Veuillez sélectionner un pack de crédits.', 'error');
        return;
    }

    const creditPrices = {
       '10': 200, '100': 1000, '500': 4500, '1000': 8000
    };

    const price = creditPrices[creditAmount];

    var fedaPayInstance = FedaPay.init({
        public_key: 'pk_live_TfSz212W0xSMKK7oPEogkFmp',
        transaction: {
            amount: price,
            description: `Achat de ${creditAmount} crédits pour Eduque moi`
        },
        customer: {
            email: 'client@example.com'
        },
        onComplete: async function(response) {
            if (response.reason === FedaPay.CHECKOUT_COMPLETED) {
                const transaction = {
                    id: response.id,
                    description: `Achat de ${creditAmount} crédits pour Eduque moi`,
                    amount: price
                };
                await addCreditsToUser(parseInt(creditAmount));
                showInvoiceDetails(transaction);
                showNotification(`${creditAmount} crédits ont été ajoutés à votre compte.`, 'success');
                
            // Vérifier si c'est le premier achat et récompenser le parrain
            await checkFirstPurchaseAndRewardReferrer(currentUser.username, price);
            } else {
                showNotification('Le paiement a été annulé ou a échoué.', 'error');
            }
        }
    });
    fedaPayInstance.open();
}

// Fonction pour vérifier le premier achat et récompenser le parrain
async function checkFirstPurchaseAndRewardReferrer(username, amount) {
    const userRef = db.ref(`users/${username}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();
    
    if (userData && !userData.firstPurchase) {
        // Marquer que l'utilisateur a effectué son premier achat
        await userRef.update({ firstPurchase: true });
        
        // Récompenser le parrain si l'utilisateur a été parrainé
        if (userData.referredBy) {
            const referrerQuery = await db.ref('users').orderByChild('referralCode').equalTo(userData.referredBy).once('value');
            const referrer = referrerQuery.val();
            
            if (referrer) {
                const referrerUsername = Object.keys(referrer)[0];
                const referrerRef = db.ref(`users/${referrerUsername}`);
                
                await referrerRef.transaction((user) => {
                    if (user) {
                        user.paidCredits = (user.paidCredits || 0) + 10;
                        if (user.referrals && user.referrals[username]) {
                            user.referrals[username].isActive = true;
                        }
                    }
                    return user;
                });
                
                // Mettre à jour les statistiques de parrainage
                await updateReferralStats(referrerUsername);
                
                showNotification(`Le parrain de ${username} a reçu 10 crédits pour le premier achat de son filleul !`, 'success');
            }
        }
    }
}



function getShareMessage(referralLink) {
    return encodeURIComponent(`🚀 Découvrez le secret pour booster votre apprentissage ! 🧠✨

J'ai trouvé une pépite et je ne peux pas garder ça pour moi. Imaginez avoir un assistant personnel ultra-intelligent, disponible 24/7, pour répondre à toutes vos questions... C'est ce que j'ai avec Eduque moi !

Curieux ? Cliquez sur ce lien magique et embarquez pour une aventure intellectuelle incroyable :
${referralLink}

PS : En utilisant mon lien, vous me donnez un petit coup de pouce. Mais chut, c'est notre secret ! 😉`);
}

function shareOnFacebook() {
    const url = document.getElementById('referralLink').value;
    const message = getShareMessage(url);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${message}`, '_blank');
}

function shareOnTwitter() {
    const url = document.getElementById('referralLink').value;
    const message = getShareMessage(url);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${message}`, '_blank');
}

function shareOnLinkedIn() {
    const url = document.getElementById('referralLink').value;
    const message = getShareMessage(url);
    window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=Boostez votre apprentissage avec Eduque moi&summary=${message}`, '_blank');
}

function shareOnWhatsApp() {
    const url = document.getElementById('referralLink').value;
    const message = getShareMessage(url);
    window.open(`https://wa.me/?text=${message}`, '_blank');
}

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    linkInput.select();
    document.execCommand('copy');
    showNotification('Lien de partage copié !', 'success');
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }, 100);
}

function showPaymentNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.innerHTML = `
        ${message}<br>
        <button onclick="buySubscription()">Acheter un abonnement</button>
        <button onclick="buyCredits()">Acheter des crédits</button>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 10000);
    }, 100);
}

async function showPaymentNotificationWithFreeOption(message) {
    return new Promise((resolve) => {
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.innerHTML = `
            ${message}<br>
            <button onclick="resolveNotification('free')">Utiliser le modèle gratuit</button>
            <button onclick="resolveNotification('subscription')">Acheter un abonnement</button>
            <button onclick="resolveNotification('credits')">Acheter des crédits</button>
            <button onclick="resolveNotification('cancel')">Annuler</button>
        `;
        document.body.appendChild(notification);

        window.resolveNotification = function(choice) {
            notification.remove();
            resolve(choice);
        };

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    });
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    // Mise à jour de la métadonnée color-scheme
    document.querySelector('meta[name="color-scheme"]').setAttribute('content', newTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.querySelector('.theme-toggle i');
    themeToggle.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const chatContainer = document.querySelector('.chat-container');
    sidebar.classList.toggle('visible');
    chatContainer.classList.toggle('sidebar-visible');

    // Enregistre l'état de la sidebar dans le localStorage
    localStorage.setItem('sidebarState', sidebar.classList.contains('visible'));
}

function saveConversation() {
    if (!currentUser) return;
    const conversationId = currentConversation.id || Date.now().toString();
    conversations[conversationId] = currentConversation;
    currentConversation.id = conversationId;
    localStorage.setItem(`conversations_${currentUser.username}`, JSON.stringify(conversations));
    updateConversationHistory();
}

function loadConversationHistory() {
    if (!currentUser) return;
    const savedConversations = localStorage.getItem(`conversations_${currentUser.username}`);
    if (savedConversations) {
        conversations = JSON.parse(savedConversations);
        updateConversationHistory();
    }
}

function updateConversationHistory() {
    const historyContainer = document.getElementById('historyList');
    historyContainer.innerHTML = '';

    const sortedConversations = Object.keys(conversations).sort((a, b) => parseInt(b) - parseInt(a));

    sortedConversations.forEach(id => {
        const conversation = conversations[id];
        const element = document.createElement('div');
        element.className = 'conversation-item';
        
        const textSpan = document.createElement('span');
        textSpan.textContent = `Conversation du ${new Date(parseInt(id)).toLocaleString()}`;
        textSpan.onclick = () => loadConversation(id);
        
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash delete-icon';
        deleteIcon.onclick = (e) => {
            e.stopPropagation();
            deleteConversation(id);
        };
        
        element.appendChild(textSpan);
        element.appendChild(deleteIcon);
        historyContainer.appendChild(element);
    });
}

function deleteConversation(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette conversation ?')) {
        delete conversations[id];
        localStorage.setItem(`conversations_${currentUser.username}`, JSON.stringify(conversations));
        updateConversationHistory();
    }
}

function createNewConversation() {
    if (currentConversation.length > 0) {
        saveConversation();
    }

    currentConversation = [];
    
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = '';

    updateConversationHistory();

    addMessageToChat('ai', 'Bienvenue dans une nouvelle conversation ! Comment puis-je vous aider aujourd\'hui ?');

    messageContainer.scrollTop = 0;

    document.getElementById('userInput').focus();
}

function loadConversation(id) {
    if (currentConversation.length > 0 && currentConversation.id !== id) {
        saveConversation();
    }

    currentConversation = conversations[id];
    currentConversation.id = id;
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.innerHTML = '';
    currentConversation.forEach(message => {
        addMessageToChat(message.sender, message.content);
    });

    messageContainer.scrollTop = 0;
}

async function syncUserData() {
    if (!currentUser) return;

    const updateData = {
        freeCredits: currentUser.freeCredits || 0,
        paidCredits: currentUser.paidCredits || 0,
        lastFreeCreditsReset: currentUser.lastFreeCreditsReset || new Date().toISOString()
    };

    if (currentUser.subscription) {
        updateData.subscription = currentUser.subscription;
    }
    if (currentUser.subscriptionEndDate) {
        updateData.subscriptionEndDate = currentUser.subscriptionEndDate;
    }

    const userRef = db.ref('users/' + currentUser.username);
    try {
        await userRef.update(updateData);
        console.log("Données utilisateur mises à jour avec succès:", updateData);
    } catch (error) {
        console.error("Erreur lors de la mise à jour des données utilisateur:", error);
        showNotification("Erreur lors de la mise à jour de votre profil. Veuillez réessayer.", 'error');
    }
}

function adjustTextareaHeight() {
    const textarea = document.getElementById('userInput');
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function resetTextareaHeight() {
    const textarea = document.getElementById('userInput');
    textarea.style.height = 'auto';
}

async function attemptAutoLogin() {
    const storedInfo = getStoredLoginInfo();
    if (storedInfo.username && storedInfo.password) {
        try {
            const userRef = db.ref('users/' + storedInfo.username);
            const snapshot = await userRef.once('value');
            if (snapshot.exists() && snapshot.val().password === storedInfo.password) {
                const userData = snapshot.val();
                currentUser = { 
                    username: storedInfo.username, 
                    freeCredits: userData.freeCredits,
                    paidCredits: userData.paidCredits,
                    subscription: userData.subscription,
                    subscriptionEndDate: userData.subscriptionEndDate,
                    lastFreeCreditsReset: userData.lastFreeCreditsReset
                };
                await resetFreeCreditsIfNeeded();
                updateUIForLoggedInUser();
                console.log('Connexion automatique réussie');
            } else {
                clearLoginInfo();
                console.log('Échec de la connexion automatique : informations invalides');
            }
        } catch (error) {
            console.error('Erreur lors de la connexion automatique:', error);
            clearLoginInfo();
        }
    }
}

function saveSelectedModel() {
    const selectedModel = document.getElementById('modelSelect').value;
    localStorage.setItem('selectedModel', selectedModel);
}

function loadSelectedModel() {
    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
        document.getElementById('modelSelect').value = savedModel;
    }
}

function showUpgradeButton(messageElement) {
    const upgradeButton = document.createElement('button');
    upgradeButton.textContent = 'Passer à un modèle avancé';
    upgradeButton.className = 'upgrade-button';
    upgradeButton.onclick = () => {
        if (hasValidSubscription() || currentUser.paidCredits > 0) {
            document.getElementById('modelSelect').value = 'gemini-1.5-pro';
            showNotification('Modèle mis à jour vers Gemini 1.5 Pro', 'success');
        } else {
            showPaymentNotification('Vous avez besoin d\'un abonnement ou de crédits payants pour utiliser ce modèle.');
        }
    };
    messageElement.appendChild(upgradeButton);
}

function animateResponse(element, text) {
    let index = 0;
    element.textContent = '';
    const interval = setInterval(() => {
        if (index < text.length) {
            element.textContent += text[index];
            index++;
        } else {
            clearInterval(interval);
        }
    }, 1);
}

function loadPromptCategories() {
    const categoriesList = document.getElementById('promptCategories');
    categoriesList.innerHTML = '';
    
    db.ref('prompts').once('value', (snapshot) => {
        prompts = snapshot.val() || {};
        const categories = [...new Set(Object.values(prompts).map(prompt => prompt.category))];
        
        categories.forEach(category => {
            const li = document.createElement('li');
            li.textContent = category;
            li.onclick = () => {
                document.querySelectorAll('#promptCategories li').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                loadPromptsForCategory(category);
            };
            categoriesList.appendChild(li);
        });

        if (categories.length > 0) {
            loadPromptsForCategory(categories[0]);
            categoriesList.firstChild.classList.add('active');
        }
    });
}

function loadPromptsForCategory(category) {
    const promptList = document.getElementById('promptList');
    promptList.innerHTML = '';
    
    Object.entries(prompts).forEach(([id, prompt]) => {
        if (prompt.category === category) {
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="prompt-item" onclick="selectPrompt('${id}', ${JSON.stringify(prompt).replace(/"/g, '&quot;')})">
                    <span class="prompt-title">${prompt.title}</span>
                    <span class="prompt-select-icon"><i class="fas fa-plus-circle"></i></span>
                </div>
            `;
            promptList.appendChild(li);
        }
    });
}

function selectPrompt(id, prompt) {
    pinnedPrompt = { id, ...prompt };
    updatePinnedPrompt();
    closePromptModal();
    showNotification('Prompt sélectionné', 'success');
  
    // Insérer le texte indicatif dans la zone de saisie en tant que placeholder
    const userInput = document.getElementById('userInput');
    userInput.placeholder = pinnedPrompt.indicativeText || 'Tapez votre texte ici...';
    adjustTextareaHeight();
  }

function closePromptModal() {
    document.getElementById('promptListModal').style.display = 'none';
}

function togglePromptList() {
    const modal = document.getElementById('promptListModal');
    modal.style.display = "block";
    loadPromptCategories();
}

function updatePinnedPrompt() {
    const pinnedItems = document.getElementById('pinnedItems');
    const existingPrompt = pinnedItems.querySelector('.pinned-item[data-type="prompt"]');
    if (existingPrompt) {
        existingPrompt.remove();
    }
    if (pinnedPrompt) {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        item.setAttribute('data-type', 'prompt');
        item.innerHTML =`
            <span class="icon">💬</span>
            <span class="name" title="${pinnedPrompt.title}">${pinnedPrompt.title}</span>
            <span class="remove" onclick="removePinnedPrompt()">❌</span>
        `;
        pinnedItems.appendChild(item);
    }
}

function removePinnedPrompt() {
    pinnedPrompt = null;
    updatePinnedPrompt();
}

function openLibrary() {
    console.log("Tentative d'ouverture de la bibliothèque");
    if (currentUser) {
        console.log("Utilisateur connecté:", currentUser);
        const userData = {
            username: currentUser.username,
            freeCredits: currentUser.freeCredits,
            paidCredits: currentUser.paidCredits,
            subscription: currentUser.subscription
        };
        localStorage.setItem('eduqueMoiUserData', JSON.stringify(userData));
        console.log("Données utilisateur enregistrées dans localStorage");
        window.location.href = 'Bibliothèque.html';
    } else {
        console.log("Utilisateur non connecté");
        alert("Veuillez vous connecter pour accéder à la bibliothèque.");
    }
}

// Fonction pour afficher la modal de parrainage (mise à jour)
async function showReferralModal() {
    const modal = document.getElementById('referralModal');
    modal.style.display = 'block';
    
    const referralCode = await getOrCreateReferralCode();
    if (referralCode) {
        const referralLink = `https://eduquemoi.netlify.app/?ref=${referralCode}`;
        document.getElementById('referralLink').value = referralLink;
        
        // Créer le message d'invitation
        const inviteMessage = `Rejoignez-moi sur Eduque moi et commencez votre voyage d'apprentissage ! Utilisez mon lien de parrainage pour obtenir des bonus spéciaux : ${referralLink}`;
        
        // Vous pouvez stocker ce message dans un attribut data pour une utilisation facile
        document.getElementById('referralLink').setAttribute('data-invite-message', inviteMessage);
    } else {
        document.getElementById('referralLink').value = "Erreur lors de la récupération du code de parrainage.";
    }
    
    // Mettre à jour les statistiques de parrainage
    await updateReferralStats(currentUser.username);
}

// Fonction pour générer un code de parrainage unique
function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Fonction pour obtenir ou créer un code de parrainage pour l'utilisateur actuel
async function getOrCreateReferralCode() {
    if (!currentUser) return null;

    const userRef = db.ref('users/' + currentUser.username);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();

    if (userData && userData.referralCode) {
        return userData.referralCode;
    } else {
        const newCode = generateReferralCode();
        await userRef.update({ referralCode: newCode });
        return newCode;
    }
}


// Fonction pour mettre à jour les statistiques de parrainage
async function updateReferralStats(referrerUsername) {
    const userRef = db.ref(`users/${referrerUsername}`);
    const snapshot = await userRef.once('value');
    const userData = snapshot.val();
    
    if (userData && userData.referrals) {
        const referrals = userData.referrals;
        const totalReferrals = Object.keys(referrals).length;
        const activeReferrals = Object.values(referrals).filter(r => r.isActive).length;
        
        await userRef.update({
            totalReferrals: totalReferrals,
            activeReferrals: activeReferrals
        });

        // Si l'utilisateur courant est le parrain, mettre à jour l'interface
        if (currentUser && currentUser.username === referrerUsername) {
            document.getElementById('totalReferrals').textContent = totalReferrals;
            document.getElementById('activeReferrals').textContent = activeReferrals;
        }
    }
}

window.onload = async function() {
    await attemptAutoLogin();

    if (currentUser) {
        if (currentUser.freeCredits === undefined) currentUser.freeCredits = 0;
        if (currentUser.paidCredits === undefined) currentUser.paidCredits = 0;
        if (currentUser.subscription === undefined) currentUser.subscription = null;
        if (currentUser.subscriptionEndDate === undefined) currentUser.subscriptionEndDate = null;
        if (currentUser.lastFreeCreditsReset === undefined) currentUser.lastFreeCreditsReset = new Date().toISOString();

        // Charger les données d'importation de fichiers depuis la base de données
        const userRef = db.ref('users/' + currentUser.username);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();
        if (userData) {
            importedFilesCount = userData.importedFilesCount || 0;
            lastImportReset = new Date(userData.lastImportReset || new Date());
        }

        await syncUserData();
    }

        // Charger la liste des clés API
        await loadApiKeyList();
    
        // Initialiser la rotation des clés API
        initializeApiKeyRotation();

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    setupUIEventListeners();

    if (currentUser) {
        loadConversationHistory();
    }

    initModals();

    loadSelectedModel();
    document.getElementById('modelSelect').addEventListener('change', saveSelectedModel);

    restoreAppState();

    initializeNewDiscussion();

    document.body.classList.add('loaded');

    setInterval(checkSubscriptionStatus, 3600000);

    // Charger la liste des clés API au chargement de la page
    await loadApiKeyList();

    // Initialiser l'API Gemini avec une clé aléatoire
    initializeGeminiAPI();

    // Mise à jour de la sélection du modèle par défaut
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect.value) {
        modelSelect.value = 'gemini-1.5-flash';
    }

};

function setupUIEventListeners() {
    const inputContainer = document.querySelector('.input-container');
    const userInput = document.getElementById('userInput');
    const fileLabel = document.querySelector('.file-label');
    const sendButton = inputContainer.querySelector('button:last-child');

    function adjustInputWidth() {
        const containerWidth = inputContainer.offsetWidth;
        const fileLabelWidth = fileLabel.offsetWidth;
        const promptButtonWidth = document.getElementById('promptListButton').offsetWidth;
        const sendButtonWidth = sendButton.offsetWidth;
        const padding = 30;
        userInput.style.width = `${containerWidth - fileLabelWidth - promptButtonWidth - sendButtonWidth - padding}px`;
    }

    adjustInputWidth();
    window.addEventListener('resize', adjustInputWidth);

    userInput.addEventListener('input', adjustTextareaHeight);

    document.getElementById('modelSelect').addEventListener('change', checkModelAccess);

    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('visible');
        document.querySelector('.chat-container').classList.remove('sidebar-visible');
    }

    if (currentUser) {
        const userRef = db.ref('users/' + currentUser.username);
        userRef.on('value', (snapshot) => {
            const userData = snapshot.val();
            if (userData) {
                currentUser = {
                    ...currentUser,
                    freeCredits: userData.freeCredits,
                    paidCredits: userData.paidCredits,
                    subscription: userData.subscription,
                    subscriptionEndDate: userData.subscriptionEndDate,
                    lastFreeCreditsReset: userData.lastFreeCreditsReset
                };
                updateUIForLoggedInUser();
            }
        });
    }
}

function initModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close');

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        modals.forEach(modal => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

// Vérification au chargement de la page pour les utilisateurs existants
window.addEventListener('load', async () => {
    if (currentUser) {
        const hasSeenTour = await checkGuidedTourStatus(currentUser.username);
        if (!hasSeenTour) {
            startGuidedTour();
            await markGuidedTourAsSeen(currentUser.username);
        }
    }
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

document.getElementById('userInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const value = this.value;
        this.value = value.substring(0, start) + '\n' + value.substring(end);
        this.selectionStart = this.selectionEnd = start + 1;
    }
});

function checkApiStatus() {
    axios.get(`${API_BASE_URL}models?key=${API_KEY}`)
        .then(response => {
            console.log("Statut de l'API Gemini:", response.status);
            console.log("Modèles disponibles:", response.data);
        })
        .catch(error => {
            console.error("Erreur lors de la vérification du statut de l'API:", error);
        });
}

function checkApiStatusRegularly() {
    checkApiStatus();
    setInterval(checkApiStatus, 60000);
}

window.addEventListener('offline', function() {
    showNotification('Vous êtes hors ligne. Veuillez vérifier votre connexion internet.', 'error');
});

window.addEventListener('online', function() {
    showNotification('Vous êtes de nouveau en ligne.', 'success');
});

window.addEventListener('beforeunload', function() {
    if (currentUser) {
        localStorage.setItem('lastConversation', JSON.stringify(currentConversation));
    }
});

function restoreAppState() {
    const lastConversation = localStorage.getItem('lastConversation');
    if (lastConversation) {
        currentConversation = JSON.parse(lastConversation);
        currentConversation.forEach(message => {
            addMessageToChat(message.sender, message.content);
        });
    }
}

// Fonction pour vérifier si le modèle sélectionné est un modèle de génération d'image
function isImageGenerationModel(model) {
    return model.startsWith('recraft-');
}

// Fonction pour convertir le modèle sélectionné en style Recraft
function getRecraftStyle(model) {
    const styles = {
        'recraft-realistic': 'realistic_image',
        'recraft-digital': 'digital_illustration',
        'recraft-vector': 'vector_illustration',
        'recraft-icon': 'icon'
    };
    return styles[model] || 'realistic_image';
}

// Structure de données pour le suivi des générations d'images
async function initializeImageGenerationTracking(username) {
    const userRef = db.ref(`users/${username}`);
    const snapshot = await userRef.child('imageGeneration').once('value');
    const data = snapshot.val();
    
    if (!data || isNewDay(data.lastReset)) {
        // Initialiser ou réinitialiser le compteur pour un nouveau jour
        await userRef.child('imageGeneration').set({
            dailyCount: 0,
            lastReset: new Date().toISOString()
        });
    }
}

function isNewDay(lastResetDate) {
    if (!lastResetDate) return true;
    
    const last = new Date(lastResetDate);
    const now = new Date();
    
    return last.getDate() !== now.getDate() || 
           last.getMonth() !== now.getMonth() || 
           last.getFullYear() !== now.getFullYear();
}

async function getImageGenerationCount(username) {
    const userRef = db.ref(`users/${username}`);
    const snapshot = await userRef.child('imageGeneration').once('value');
    const data = snapshot.val();
    
    if (!data || isNewDay(data.lastReset)) {
        await initializeImageGenerationTracking(username);
        return 0;
    }
    
    return data.dailyCount;
}

async function incrementImageGenerationCount(username) {
    const userRef = db.ref(`users/${username}`);
    await userRef.child('imageGeneration').transaction((data) => {
        if (!data || isNewDay(data.lastReset)) {
            return {
                dailyCount: 1,
                lastReset: new Date().toISOString()
            };
        }
        
        return {
            dailyCount: data.dailyCount + 1,
            lastReset: data.lastReset
        };
    });
}

// Modifier la fonction canGenerateImage pour retirer la demande de confirmation
async function canGenerateImage() {
    const imageCount = await getImageGenerationCount(currentUser.username);
    const hasSubscription = hasValidSubscription();
    const hasEnoughCredits = currentUser.paidCredits >= 5 || currentUser.freeCredits >= 5;
    
    // Cas 1: Abonné avec générations gratuites disponibles
    if (hasSubscription && imageCount < 5) {
        return {
            canGenerate: true,
            useFreeGeneration: true,
            message: `Il vous reste ${5 - imageCount} générations gratuites aujourd'hui.`
        };
    }
    
    // Cas 2: Abonné ayant épuisé ses générations gratuites ou non abonné avec assez de crédits
    if (hasEnoughCredits) {
        return {
            canGenerate: true,
            useFreeGeneration: false,
            message: "Génération avec consommation de 5 crédits"
        };
    }
    
    // Cas 3: Pas assez de crédits
    return {
        canGenerate: false,
        useFreeGeneration: false,
        message: "Vous n'avez pas assez de crédits pour générer une image."
    };
}

// Fonction pour demander confirmation avant d'utiliser des crédits
function confirmCreditUsage(message) {
    return new Promise((resolve) => {
        const notification = document.createElement('div');
        notification.className = 'notification warning';
        notification.innerHTML = `
            <div class="notification-content">
                <p>${message}</p>
                <div class="notification-actions">
                    <button onclick="this.closest('.notification').setAttribute('data-response', 'true')">
                        Utiliser mes crédits
                    </button>
                    <button onclick="this.closest('.notification').setAttribute('data-response', 'false')">
                        Annuler
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);

        function handleResponse(e) {
            const response = e.target.closest('.notification').getAttribute('data-response');
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
                resolve(response === 'true');
            }, 300);
        }

        notification.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', handleResponse);
        });
    });
}

// Fonction améliorée pour convertir le Markdown en HTML
function parseMarkdownTable(markdown) {
    const lines = markdown.trim().split('\n');
    if (lines.length < 3) return null;

    // Vérifier si c'est un tableau valide
    const isValidTable = lines.every(line => line.trim().startsWith('|') && line.trim().endsWith('|'));
    if (!isValidTable) return null;

    // Extraire les cellules
    const rows = lines.map(line => {
        const cells = line.trim()
            .slice(1, -1) // Enlever les pipes externes
            .split('|')
            .map(cell => cell.trim());
        return cells;
    });

    // Ignorer la ligne de séparation
    const headerRow = rows[0];
    const bodyRows = rows.slice(2);

    // Construire le HTML
    let html = '<div class="table-wrapper"><table><thead><tr>';
    
    // En-têtes
    headerRow.forEach(header => {
        html += `<th>${header}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    // Corps du tableau
    bodyRows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td>${cell}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    
    // Ajouter les actions du tableau
    html += `<div class="table-actions">
        <button onclick="copyTable(this.closest('.table-wrapper'))">
            <i class="fas fa-copy"></i> Copier
        </button>
        <button onclick="exportTableAsCSV(this.closest('.table-wrapper'))">
            <i class="fas fa-download"></i> CSV
        </button>
    </div></div>`;
    
    return html;
}

// Fonction pour détecter et convertir les tableaux dans le message
function processMessageContent(content) {
    // Détecter les blocs de tableau Markdown
    const tableRegex = /\|[\s\S]+?\n[-|\s]+\n[\s\S]+?\n(?=\n|$)/g;
    return content.replace(tableRegex, match => {
        const tableHtml = parseMarkdownTable(match);
        return tableHtml || match;
    });
}



function addMessageToChat(sender, message) {
    const messageContainer = document.getElementById('messageContainer');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');

    if (sender === 'ai') {
        // Traitement des ** avant le formatage des tableaux
        let processedMessage = message;
        // Remplacer les ** en début de ligne par des sauts de ligne
        processedMessage = processedMessage.replace(/^\*\*/gm, '\n');
        // Supprimer les autres ** dans le texte
        processedMessage = processedMessage.replace(/\*\*/g, '');

        // Formatage des tableaux après le traitement des **
        processedMessage = formatMarkdownTable(processedMessage);

        const textElement = document.createElement('div');
        textElement.innerHTML = processedMessage;
        messageElement.appendChild(textElement);

        // Ajouter les actions
        const actionsElement = document.createElement('div');
        actionsElement.classList.add('message-actions');
        actionsElement.innerHTML = `
            <button onclick="copyResponse(this.parentNode.parentNode)"><i class="fas fa-copy"></i></button>
            <button onclick="exportResponse(this.parentNode.parentNode, 'pdf')"><i class="fas fa-file-pdf"></i></button>
            <button onclick="shareResponse(this.parentNode.parentNode)"><i class="fas fa-share-alt"></i></button>
            <button class="reply-button" onclick="pinResponse(this.parentNode.parentNode)"><i class="fas fa-reply"></i></button>
        `;
        messageElement.appendChild(actionsElement);

    } else {
        messageElement.textContent = message;
    }

    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    return messageElement;
}

// Fonction pour le formatage des tableaux Markdown
function formatMarkdownTable(text) {
    // Regex pour détecter les tableaux Markdown
    const tableRegex = /\|(.+)\|\n\|(?:[-:|]+\|)+\n(\|(?:.+\|)+\n?)+/g;
    
    return text.replace(tableRegex, function(table) {
        // Diviser les lignes du tableau
        const lines = table.trim().split('\n');
        if (lines.length < 3) return table;

        // Construire le HTML du tableau
        let html = '<div class="table-scroll-container"><table>';
        
        // En-tête
        const headers = lines[0].split('|').filter(cell => cell.trim());
        html += '<thead><tr>';
        headers.forEach(header => {
            html += `<th>${header.trim()}</th>`;
        });
        html += '</tr></thead>';
        
        // Corps du tableau
        html += '<tbody>';
        lines.slice(2).forEach(line => {
            const cells = line.split('|').filter(cell => cell.trim());
            if (cells.length > 0) {
                html += '<tr>';
                cells.forEach(cell => {
                    html += `<td>${cell.trim()}</td>`;
                });
                html += '</tr>';
            }
        });
        html += '</tbody></table></div>';
        
        return html;
    });
}

// Fonction pour créer un message de chargement
function createLoadingMessage() {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'message ai-message';
    loadingElement.innerHTML = `
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
    document.getElementById('messageContainer').appendChild(loadingElement);
    return loadingElement;
}

// Fonction pour animer l'affichage du texte caractère par caractère
async function animateText(element, text) {
    const contentDiv = document.createElement('div');
    element.innerHTML = ''; // Nettoyer le contenu précédent
    element.appendChild(contentDiv);
    
    // Ajouter les actions du message
    const actionsElement = document.createElement('div');
    actionsElement.className = 'message-actions';
    actionsElement.innerHTML = `
        <button onclick="copyResponse(this.parentNode.parentNode)"><i class="fas fa-copy"></i></button>
        <button onclick="exportResponse(this.parentNode.parentNode, 'pdf')"><i class="fas fa-file-pdf"></i></button>
        <button onclick="shareResponse(this.parentNode.parentNode)"><i class="fas fa-share-alt"></i></button>
        <button class="reply-button" onclick="pinResponse(this.parentNode.parentNode)"><i class="fas fa-reply"></i></button>
    `;
    
    let currentText = '';
    const delay = 10; // Délai entre chaque caractère (en ms)
    
    // Fonction pour vérifier si on est au début d'un tableau Markdown
    function isStartOfTable(text, position) {
        return text.slice(position).startsWith('\n|') || text.slice(position).startsWith('|');
    }
    
    // Fonction pour extraire le tableau complet
    function extractTable(text, startPos) {
        const lines = text.slice(startPos).split('\n');
        let tableLines = [];
        let i = 0;
        while (i < lines.length && lines[i].trim().startsWith('|')) {
            tableLines.push(lines[i]);
            i++;
        }
        return tableLines.join('\n');
    }
    
    for (let i = 0; i < text.length; i++) {
        // Vérifier si nous sommes au début d'un tableau
        if (isStartOfTable(text, i)) {
            const table = extractTable(text, i);
            if (table) {
                // Ajouter le tableau complet d'un coup et formater
                currentText += table;
                contentDiv.innerHTML = formatMarkdownTable(currentText);
                i += table.length - 1; // Ajuster l'index pour sauter le tableau
                continue;
            }
        }
        
        currentText += text[i];
        
        // Mise à jour du contenu avec formatage Markdown
        const formattedText = formatMarkdownTable(currentText);
        contentDiv.innerHTML = formattedText;
        
        // Faire défiler jusqu'au bas du conteneur
        const messageContainer = document.getElementById('messageContainer');
        messageContainer.scrollTop = messageContainer.scrollHeight;
        
        // Attendre le délai avant d'afficher le prochain caractère
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Ajouter les actions une fois l'animation terminée
    element.appendChild(actionsElement);
}




// Fonction pour mettre à jour régulièrement l'interface utilisateur
function updateUI() {
    if (currentUser) {
        document.getElementById('freeCredits').textContent = currentUser.freeCredits;
        document.getElementById('paidCredits').textContent = currentUser.paidCredits;
        document.getElementById('subscription').textContent = currentUser.subscription || 'Aucun';
    }
}



document.addEventListener('click', function(event) {
    const sidebar = document.querySelector('.sidebar');
    const menuButton = document.querySelector('.toggle-sidebar');

    if (sidebar.classList.contains('visible') && !sidebar.contains(event.target) && !menuButton.contains(event.target)) {
        toggleSidebar(); // Ferme la barre latérale si elle est ouverte et que le clic est en dehors
        event.preventDefault(); // Empêche l'action par défaut du bouton retour (navigation)
    }
});


window.onpopstate = function(event) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('visible')) {
        toggleSidebar(); // Ferme la sidebar lorsque le bouton retour est utilisé
        // Empêcher le rechargement de la page ou d'autres actions par défaut du bouton retour
        event.preventDefault(); 
        history.pushState({}, '', ''); // Maintenir l'état actuel de l'historique
        return false; // Empêcher le comportement par défaut du navigateur

    }
};


// Modifier l'input de fichier pour accepter les fichiers docx et doc
document.getElementById('fileInput').accept = '.pdf,.jpg,.jpeg,.png,.docx,.doc';

// Appel de updateUI toutes les 5 minutes
setInterval(updateUI, 300000);

// Initialisation
checkApiStatusRegularly();

// Exportation des fonctions et variables nécessaires
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.login = login;
window.register = register;
window.logout = logout;
window.sendMessage = sendMessage;
window.buySubscription = buySubscription;
window.buyCredits = buyCredits;
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.createNewConversation = createNewConversation;
window.handleFileUpload = handleFileUpload;
window.togglePromptList = togglePromptList;
window.showReferralModal = showReferralModal;
window.generateReferralCode = generateReferralCode;
window.copyReferralLink = copyReferralLink;
window.shareOnFacebook = shareOnFacebook;
window.shareOnTwitter = shareOnTwitter;
window.shareOnLinkedIn = shareOnLinkedIn;
window.shareOnWhatsApp = shareOnWhatsApp;
window.removePinnedFile = removePinnedFile;
