// Configuration Firebase (à remplacer par vos propres informations)
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
const storage = firebase.storage(); // Pour accéder à Firebase Storage

let currentUser = null;
let documents = [];
let currentPage = 1;
const documentsPerPage = 12;

// Fonction pour charger les informations de l'utilisateur
function loadUserInfo() {
    const userData = JSON.parse(localStorage.getItem('eduqueMoiUserData'));
    if (userData && userData.token) {
        // Vérification du token côté serveur (non implémentée dans cet exemple)
        currentUser = userData;
        document.getElementById('username').textContent = currentUser.username;
        document.getElementById('availableCredits').textContent = currentUser.freeCredits + currentUser.paidCredits;
        document.getElementById('logoutBtn').classList.remove('hidden');
    } else {
        // Rediriger vers la page principale si l'utilisateur n'est pas connecté ou si le token est invalide
        window.location.href = 'index.html';
    }
}

// Fonction pour charger les catégories
function loadCategories() {
    db.ref('categories').once('value', (snapshot) => {
        const categories = snapshot.val();
        const categoryList = document.getElementById('categoryList');
        categoryList.innerHTML = '';
        for (const [id, name] of Object.entries(categories)) {
            const li = document.createElement('li');
            li.textContent = name.name;
            li.onclick = () => filterByCategory(id);
            categoryList.appendChild(li);
        }
    });
}

// Fonction pour charger les documents
function loadDocuments() {
    db.ref('documents').once('value', (snapshot) => {
        documents = Object.entries(snapshot.val() || {}).map(([id, doc]) => ({ id, ...doc }));
        displayDocuments();
    });
}

// Fonction pour afficher les documents
function displayDocuments() {
    const container = document.getElementById('documentContainer');
    container.innerHTML = '';
    const start = (currentPage - 1) * documentsPerPage;
    const end = start + documentsPerPage;
    const pageDocuments = documents.slice(start, end);

    pageDocuments.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'document-card';
        card.innerHTML = `
            <img src="${doc.imageUrls[0]}" alt="${doc.title}"> 
            <h3>${doc.title}</h3>
            <p>${doc.description ? doc.description.substring(0, 50) + '...' : 'Aucune description'}</p>
            <span class="credits">${doc.price} crédits</span>
        `;
        card.onclick = () => openDocumentModal(doc);
        container.appendChild(card);
    });

    updatePagination();
}

// Fonction pour mettre à jour la pagination
function updatePagination() {
    const totalPages = Math.ceil(documents.length / documentsPerPage);
    document.getElementById('currentPage').textContent = `Page ${currentPage}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
}

// Fonction pour changer de page
function changePage(delta) {
    currentPage += delta;
    displayDocuments();
}

// Fonction pour filtrer par catégorie
function filterByCategory(categoryId) {
    db.ref('documents').orderByChild('category').equalTo(categoryId).once('value', (snapshot) => {
        documents = Object.entries(snapshot.val() || {}).map(([id, doc]) => ({ id, ...doc }));
        currentPage = 1;
        displayDocuments();
    });
}

// Fonction pour rechercher des documents
function searchDocuments() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filteredDocuments = documents.filter(doc =>
        doc.title.toLowerCase().includes(searchTerm) ||
        (doc.description && doc.description.toLowerCase().includes(searchTerm))
    );
    documents = filteredDocuments;
    currentPage = 1;
    displayDocuments();
}

// Fonction pour ouvrir la modale d'un document
function openDocumentModal(doc) {
    const modal = document.getElementById('documentModal');
    document.getElementById('modalTitle').textContent = doc.title;
    document.getElementById('modalDescription').textContent = doc.description || 'Aucune description disponible.';
    document.getElementById('modalCredits').textContent = `${doc.price} crédits`;
    
    // Initialiser le carrousel Owl Carousel
    const carousel = $('.owl-carousel');
    carousel.empty(); // Vider le carrousel
    doc.imageUrls.forEach(imageUrl => {
        carousel.append(`<div class="item"><img src="${imageUrl}" alt="${doc.title}"></div>`);
    });
    carousel.owlCarousel({
        items: 1,
        loop: false,
        nav: true,
        dots: true
    });

    modal.style.display = 'block';

    loadComments(doc.id);
    initializeRating(doc.id);
}

// Fonction pour charger les commentaires d'un document
function loadComments(docId) {
    const commentsContainer = document.getElementById('commentsContainer');
    commentsContainer.innerHTML = 'Chargement des commentaires...';

    db.ref(`comments/${docId}`).once('value', (snapshot) => {
        commentsContainer.innerHTML = ''; // Effacer le message de chargement
        const comments = snapshot.val();
        if (comments) {
            for (const [commentId, commentData] of Object.entries(comments)) {
                const commentElement = document.createElement('div');
                commentElement.className = 'comment';
                commentElement.innerHTML = `
                    <p><strong>${commentData.username}:</strong> ${commentData.text}</p>
                    <small>${new Date(commentData.timestamp).toLocaleString()}</small>
                `;
                commentsContainer.appendChild(commentElement);
            }
        } else {
            commentsContainer.innerHTML = '<p>Aucun commentaire pour le moment.</p>';
        }
    });
}

// Fonction pour ajouter un commentaire
function addComment() {
    const docId = document.getElementById('modalTitle').textContent;
    const commentText = document.getElementById('commentInput').value;
    
    if (!commentText.trim()) return;
    
    const newCommentRef = db.ref(`comments/${docId}`).push();
    newCommentRef.set({
        username: currentUser.username,
        text: commentText,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        document.getElementById('commentInput').value = '';
        loadComments(docId); // Recharger les commentaires
        addToHistory('Ajout d\'un commentaire sur le document : ' + docId);
    });
}

// Fonction pour initialiser les étoiles de notation
function initializeRating(docId) {
    const ratingStars = document.querySelectorAll('.rating .fa-star');
    ratingStars.forEach(star => {
        star.classList.remove('fas', 'checked');
        star.classList.add('far');
        star.onclick = () => {
            const rating = star.dataset.rating;
            updateRating(docId, rating);
        };
    });

    // Charger la note de l'utilisateur s'il en a déjà donné une
    db.ref(`ratings/${currentUser.username}/${docId}`).once('value', (snapshot) => {
        const userRating = snapshot.val();
        if (userRating) {
            highlightStars(userRating);
        }
    });
}

// Fonction pour mettre à jour la note d'un document
function updateRating(docId, rating) {
    db.ref(`ratings/${currentUser.username}/${docId}`).set(parseInt(rating))
        .then(() => {
            highlightStars(rating);
            addToHistory('Notation du document : ' + docId + ' avec ' + rating + ' étoiles');
        });
}

// Fonction pour mettre en évidence les étoiles en fonction de la note
function highlightStars(rating) {
    const ratingStars = document.querySelectorAll('.rating .fa-star');
    ratingStars.forEach(star => {
        const starRating = parseInt(star.dataset.rating);
        if (starRating <= rating) {
            star.classList.remove('far');
            star.classList.add('fas', 'checked');
        } else {
            star.classList.remove('fas', 'checked');
            star.classList.add('far');
        }
    });
}

// Fonction pour fermer la modale
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Fonction pour acheter un document
function purchaseDocument() {
    const docId = document.getElementById('modalTitle').textContent;
    const credits = parseInt(document.getElementById('modalCredits').textContent);

    if (currentUser.freeCredits + currentUser.paidCredits >= credits) {
        // Déduire les crédits
        if (currentUser.freeCredits >= credits) {
            currentUser.freeCredits -= credits;
        } else {
            const remainingCredits = credits - currentUser.freeCredits;
            currentUser.freeCredits = 0;
            currentUser.paidCredits -= remainingCredits;
        }

        // Mettre à jour l'affichage des crédits
        document.getElementById('availableCredits').textContent = currentUser.freeCredits + currentUser.paidCredits;

        // Mettre à jour les données utilisateur dans le localStorage
        localStorage.setItem('eduqueMoiUserData', JSON.stringify(currentUser));

        // Ajouter le document à la bibliothèque de l'utilisateur
        db.ref(`userLibraries/${currentUser.username}/${docId}`).set(true)
            .then(() => {
                alert(`Vous avez acheté le document "${docId}" pour ${credits} crédits.`);
                closeModal('documentModal');
                addToHistory('Achat du document : ' + docId);
            });
    } else {
        alert("Vous n'avez pas assez de crédits pour acheter ce document.");
    }
}

// Fonction pour prévisualiser un document 
function previewDocument() {
    const docId = document.getElementById('modalTitle').textContent;
    alert(`La fonctionnalité de prévisualisation n'est pas encore disponible pour "${docId}".`);
    // Vous pouvez implémenter ici une meilleure prévisualisation, 
    // par exemple en utilisant une autre bibliothèque JavaScript pour afficher les images en plein écran.
}

// Fonction pour partager un document
function shareDocument() {
    const docId = document.getElementById('modalTitle').textContent;
    const shareUrl = `https://votre-site.com/document/${docId}`; // Remplacer par l'URL réelle de partage
    navigator.clipboard.writeText(shareUrl)
        .then(() => {
            alert(`Lien de partage copié : ${shareUrl}`);
            addToHistory('Partage du document : ' + docId);
        })
        .catch(err => {
            console.error('Erreur lors de la copie du lien de partage :', err);
            alert('Erreur lors de la copie du lien de partage.');
        });
}

// Fonction pour afficher la bibliothèque de l'utilisateur
function showMyLibrary() {
    // Charger les documents de la bibliothèque de l'utilisateur
    db.ref(`userLibraries/${currentUser.username}`).once('value', (snapshot) => {
        const userLibrary = snapshot.val() || {};
        const docIds = Object.keys(userLibrary);
        documents = documents.filter(doc => docIds.includes(doc.id));
        currentPage = 1;
        displayDocuments();
    });
}

// Fonction pour afficher les favoris de l'utilisateur
function showMyFavorites() {
    // Charger les documents favoris de l'utilisateur
    db.ref(`favorites/${currentUser.username}`).once('value', (snapshot) => {
        const userFavorites = snapshot.val() || {};
        const docIds = Object.keys(userFavorites);
        documents = documents.filter(doc => docIds.includes(doc.id));
        currentPage = 1;
        displayDocuments();
    });
}

// Fonction pour afficher les documents hors ligne
function showOfflineDocs() {
    // Charger les documents hors ligne de l'utilisateur (non implémenté dans cet exemple)
    alert('La fonctionnalité "Mes doc hors ligne" n\'est pas encore disponible.');
}

// Fonction pour ajouter une action à l'historique
function addToHistory(action) {
    const timestamp = new Date().toLocaleString();
    const historyList = document.getElementById('historyList');
    const newHistoryItem = document.createElement('li');
    newHistoryItem.innerHTML = `
        <span class="timestamp">${timestamp}</span> - ${action}
    `;
    historyList.prepend(newHistoryItem); // Ajouter au début de la liste
}

// Fonction pour revenir à la page principale
function backToMain() {
    window.location.href = 'index.html';
}

// Fonction pour se déconnecter
function logout() {
    localStorage.removeItem('eduqueMoiUserData');
    window.location.href = 'index.html';
}

// Fonction pour basculer le thème
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

// Fonction pour mettre à jour l'icône du thème
function updateThemeIcon(theme) {
    const themeToggle = document.querySelector('.theme-toggle i');
    themeToggle.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Fonction pour basculer la sidebar sur mobile
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('visible');
}

// Initialisation
window.onload = function () {
    loadUserInfo();
    loadCategories();
    loadDocuments(); 

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
};

// Gestionnaire d'événements pour la recherche
document.getElementById('searchInput').addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        searchDocuments();
    }
});

// Gestionnaire d'événements pour fermer la modal en cliquant en dehors
window.onclick = function (event) {
    if (event.target.className === 'modal') {
        event.target.style.display = 'none';
    }
};