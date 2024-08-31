const API_KEY = 'AIzaSyB3umTE3n2d5gwKzOmJz4ss1pFZMR8_vOE';
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
let currentUser = null;
let pinnedFiles = [];
let currentConversation = [];
let conversations = {};
const FREE_CREDITS_PER_DAY = 10;
const FREE_MODEL_MAX_WORDS = 50;
const FREE_MODEL_MAX_RESPONSE = 100;

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

// Fonction pour initialiser l'API Gemini (modifiée)
function initializeGeminiAPI() {
    const apiKey = getRandomApiKey(); // Obtenir une clé aléatoire
    if (apiKey) {
        genAI = new GoogleGenerativeAI(apiKey);
    } else {
        // Gérer le cas où aucune clé API n'est disponible
        showNotification("Erreur : Impossible d'initialiser l'API. Aucune clé API disponible.", 'error');
    }
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
            freeCredits: FREE_CREDITS_PER_DAY,
            paidCredits: 0,
            subscription: null,
            subscriptionEndDate: null,
            lastFreeCreditsReset: now.toISOString(),
            referredBy: referralCode || null,
            firstPurchase: false,
            totalReferrals: 0,
            activeReferrals: 0
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
                
                // Mettre à jour uniquement le total des parrainages pour le parrain
                const referrerRef = db.ref(`users/${referrerUsername}`);
                await referrerRef.transaction((user) => {
                    if (user) {
                        user.totalReferrals = (user.totalReferrals || 0) + 1;
                    }
                    return user;
                });
                
                // Mettre à jour les statistiques affichées si le parrain est l'utilisateur actuel
                if (currentUser && currentUser.username === referrerUsername) {
                    document.getElementById('totalReferrals').textContent = (parseInt(document.getElementById('totalReferrals').textContent) || 0) + 1;
                }
            }
        }
        
        currentUser = { username, ...userData };
        updateUIForLoggedInUser();
        showNotification('Inscription réussie !', 'success');
        closeModal('registerModal');
        storeLoginInfo(username, password);
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
            currentUser = { 
                username, 
                freeCredits: userData.freeCredits,
                paidCredits: userData.paidCredits,
                subscription: userData.subscription,
                subscriptionEndDate: userData.subscriptionEndDate,
                lastFreeCreditsReset: userData.lastFreeCreditsReset
            };
            await resetFreeCreditsIfNeeded();
            updateUIForLoggedInUser();
            showNotification('Connexion réussie !', 'success');
            closeModal('loginModal');
            storeLoginInfo(username, password);
        } else {
            showNotification('Nom d\'utilisateur ou mot de passe incorrect.', 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la connexion:', error);
        showNotification('Erreur lors de la connexion. Veuillez réessayer.', 'error');
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

function checkModelAccess() {
    const selectedModel = document.getElementById('modelSelect').value;
    if (!['gemini-1.5-flash', 'gemini-1.0-pro'].includes(selectedModel) && !hasValidSubscription() && currentUser.paidCredits <= 0) {
        showPaymentNotification('Ce modèle nécessite un abonnement ou des crédits payants.');
        document.getElementById('modelSelect').value = 'gemini-1.5-flash';
    }
}

// Fonction pour gérer l'ajout de fichiers
function handleFileUpload(event) {
    const files = event.target.files;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
            pinnedFiles.push(file);
            updatePinnedFiles();
        }
    }
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

        const iconElement = document.createElement('span');
        iconElement.className = 'file-icon';
        iconElement.textContent = file.type.startsWith('image/') ? '🖼️' : '📄';

        const nameElement = document.createElement('span');
        nameElement.className = 'file-name';
        nameElement.textContent = file.name;

        fileElement.appendChild(iconElement);
        fileElement.appendChild(nameElement);
        pinnedFilesElement.appendChild(fileElement);
    });

    return pinnedFilesElement;
}

async function sendMessage() {
    if (!currentUser) {
        showNotification('Veuillez vous connecter pour envoyer des messages.', 'error');
        return;
    }

    const userInput = document.getElementById('userInput').value.trim();
    let model = document.getElementById('modelSelect').value;
    const modelSelect = document.getElementById('modelSelect');

    if (!userInput && pinnedFiles.length === 0 && !pinnedPrompt) {
        showNotification('Veuillez entrer un message, joindre un fichier ou sélectionner un prompt.', 'error');
        return;
    }

    const requiredCredits = pinnedFiles.length > 0 ? pinnedFiles.length : 1;

    // Vérification des crédits et sélection du modèle
    if (!hasValidSubscription()) {
        if (model === 'gemini-1.5-flash') {
            // Vérifier d'abord les crédits payants pour Gemini 1.5 Flash
            if (currentUser.paidCredits >= requiredCredits) {
                showNotification('Utilisation de crédits payants pour Gemini 1.5 Flash.', 'info');
            } else if (currentUser.freeCredits >= requiredCredits) {
                showNotification('Utilisation de crédits gratuits pour Gemini 1.5 Flash.', 'info');
            } else {
                showPaymentNotification('Vous n\'avez pas assez de crédits pour utiliser Gemini 1.5 Flash.');
                return;
            }
        } else if (!['gemini-1.0-pro'].includes(model)) {
            // Pour les autres modèles avancés
            if (currentUser.paidCredits < requiredCredits) {
                showPaymentNotification('Vous n\'avez pas assez de crédits payants pour ce modèle avancé.');
                return;
            }
        } else {
            // Pour Gemini 1.0 Pro (modèle gratuit)
            if (currentUser.freeCredits < requiredCredits && currentUser.paidCredits < requiredCredits) {
                showPaymentNotification('Vous n\'avez pas assez de crédits pour envoyer ce message.');
                return;
            }
        }
    }

    let displayMessage = userInput;
    let fullMessage = userInput;

    // Créer un élément de message avec les fichiers épinglés
    const messageElement = document.createElement('div');
    messageElement.className = 'message user-message';

    // Ajouter les fichiers épinglés au début du message
    if (pinnedFiles.length > 0) {
        const pinnedFilesElement = createPinnedFilesElement(pinnedFiles);
        messageElement.appendChild(pinnedFilesElement);
    }

    // Ajouter le texte du message
    const textElement = document.createElement('p');
    textElement.textContent = displayMessage;
    messageElement.appendChild(textElement);

    // Ajouter le message au conteneur
    const messageContainer = document.getElementById('messageContainer');
    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    document.getElementById('userInput').value = '';
    resetTextareaHeight();

    // Affiche l'animation de chargement et cache le bouton d'envoi
    const sendButton = document.querySelector('.input-actions button:last-child');
    sendButton.classList.add('loading');
    sendButton.disabled = true;

    try {
        const parts = [];

        if (fullMessage) {
            parts.push({ text: fullMessage });
        }

        for (const file of pinnedFiles) {
            const fileData = await readFileAsBase64(file);
            parts.push({
                inlineData: {
                    data: fileData,
                    mimeType: file.type
                }
            });
        }

        if (pinnedPrompt) {
            parts.unshift({ text: pinnedPrompt.content });
        }

        const generativeModel = genAI.getGenerativeModel({ model: model });
        const result = await generativeModel.generateContent(parts);
        const response = await result.response;
        let aiResponse = response.text();

        let messageElement;
        if (model === 'gemini-1.0-pro' || (model === 'gemini-1.5-flash' && currentUser.paidCredits < requiredCredits)) {
            const words = aiResponse.split(/\s+/);
            if (words.length > FREE_MODEL_MAX_RESPONSE) {
                aiResponse = words.slice(0, FREE_MODEL_MAX_RESPONSE).join(' ') + '...(Utilisez un modèle avancé pour avoir la suite de ma réponse)';
                showNotification(`La réponse a été tronquée à ${FREE_MODEL_MAX_RESPONSE} mots.`, 'info');
                messageElement = addMessageToChat('ai', aiResponse);
                showUpgradeButton(messageElement);
            } else {
                messageElement = addMessageToChat('ai', aiResponse);
            }
        } else {
            messageElement = addMessageToChat('ai', aiResponse);
        }

        await updateCredits(model, requiredCredits);
        pinnedFiles = [];
        updatePinnedFiles();
        removePinnedPrompt();
        saveConversation();

    } catch (error) {
        console.error('Erreur lors de la génération de la réponse:', error);
        showNotification(`Erreur : ${error.message}. Veuillez réessayer.`, 'error');

    } finally {
        // Cache l'animation de chargement et réactive le bouton d'envoi
        sendButton.classList.remove('loading');
        sendButton.disabled = false;
    }
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
    if (hasValidSubscription()) return;
    
    if (model === 'gemini-1.5-flash') {
        if (currentUser.paidCredits >= requiredCredits) {
            currentUser.paidCredits -= requiredCredits;
        } else {
            currentUser.freeCredits -= requiredCredits;
        }
    } else if (model === 'gemini-1.0-pro') {
        if (currentUser.freeCredits >= requiredCredits) {
            currentUser.freeCredits -= requiredCredits;
        } else {
            const remainingCredits = requiredCredits - currentUser.freeCredits;
            currentUser.freeCredits = 0;
            currentUser.paidCredits = Math.max(0, currentUser.paidCredits - remainingCredits);
        }
    } else {
        // Modèles avancés
        currentUser.paidCredits = Math.max(0, currentUser.paidCredits - requiredCredits);
    }
    
    document.getElementById('freeCredits').textContent = currentUser.freeCredits;
    document.getElementById('paidCredits').textContent = currentUser.paidCredits;
    
    await syncUserData();
}

function addMessageToChat(sender, message) {
    const messageContainer = document.getElementById('messageContainer');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'ai-message');
    
    if (sender === 'ai') {
        message = message.replace(/\*\*/g, '\n');
        
        const textElement = document.createElement('div');
        messageElement.appendChild(textElement);

        animateResponse(textElement, message);

        const actionsElement = document.createElement('div');
        actionsElement.classList.add('message-actions');
        actionsElement.innerHTML = `
            <button onclick="copyResponse(this.parentNode.parentNode)"><i class="fas fa-copy"></i></button>
            <button onclick="exportResponse(this.parentNode.parentNode, 'word')"><i class="fas fa-file-word"></i></button>
            <button onclick="exportResponse(this.parentNode.parentNode, 'pdf')"><i class="fas fa-file-pdf"></i></button>
            <button onclick="shareResponse(this.parentNode.parentNode)"><i class="fas fa-share-alt"></i></button>
        `;
        messageElement.appendChild(actionsElement);
    } else {
        messageElement.textContent = message;
    }

    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight;

    currentConversation.push({ sender, content: message });

    return messageElement;
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
        saveAs(blob, "response.docx");
    } else if (format === 'pdf') {
        const blob = await generatePDF(responseText);
        saveAs(blob, "response.pdf");
    }
    showNotification(`Export en ${format.toUpperCase()} réussi`, 'success');
}

async function generateWordDoc(text) {
    const content = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p>
                    <w:pPr>
                        <w:pStyle w:val="Heading1"/>
                    </w:pPr>
                    <w:r>
                        <w:t>Réponse d'Eduque moi</w:t>
                    </w:r>
                </w:p>
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
    doc.text("Réponse d'Eduque moi", 20, 20);
    
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
            title: 'Réponse de Eduque moi',
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
                        user.paidCredits = (user.paidCredits || 0) + 5;
                        if (user.referrals && user.referrals[username]) {
                            user.referrals[username].isActive = true;
                        }
                    }
                    return user;
                });
                
                // Mettre à jour les statistiques de parrainage
                await updateReferralStats(referrerUsername);
                
                showNotification(`Le parrain de ${username} a reçu 5 crédits pour le premier achat de son filleul !`, 'success');
            }
        }
    }
}

async function addCreditsToUser(amount) {
    currentUser.paidCredits += amount;
    await syncUserData();
    document.getElementById('paidCredits').textContent = currentUser.paidCredits;
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

    // Appeler resetImportedFilesCount au chargement de la page et toutes les 24 heures
    await resetImportedFilesCount();
    setInterval(resetImportedFilesCount, 24 * 60 * 60 * 1000);
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

// Fonction pour mettre à jour régulièrement l'interface utilisateur
function updateUI() {
    if (currentUser) {
        document.getElementById('freeCredits').textContent = currentUser.freeCredits;
        document.getElementById('paidCredits').textContent = currentUser.paidCredits;
        document.getElementById('subscription').textContent = currentUser.subscription || 'Aucun';
    }
}

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
